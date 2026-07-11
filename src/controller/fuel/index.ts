/**
 * Fuel controller -- CRUD business logic for fuelTransactions collection.
 * MongoDB native driver, no Mongoose/ODM.
 */
import { ObjectId } from 'mongodb';
import { getFuelTransactionsCollection, getAssetsCollection, getDriversCollection } from '@/lib/mongodb';
import {
  validateCreateFuelTransactionInput,
  validateUpdateFuelTransactionInput,
  deriveUnitCost,
  calculateFuelMetrics,
  serializeFuelTransaction,
} from './utils';
import type { CreateFuelTransactionInput, UpdateFuelTransactionInput } from './types';

/** List fuel transactions with pagination, search, and filters. */
export async function getAllFuelTransactions(
  tenantId: string,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    assetId?: string;
    driverId?: string;
    fuelType?: string;
    startDate?: string;
    endDate?: string;
    showArchived?: boolean;
    createdBy?: string;
    /**
     * Team scope for team-scoped roles. Fuel docs carry no teamIds of their own,
     * so we scope by the asset: only transactions for assets in these teams are
     * visible. Empty array = no teams = sees nothing. `undefined` = unrestricted.
     */
    teamIds?: string[];
  },
) {
  const collection = await getFuelTransactionsCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
  };

  if (options.showArchived) {
    filter.isArchived = true;
  } else {
    filter.isArchived = { $ne: true };
  }

  if (options.createdBy) {
    filter.createdBy = ObjectId.createFromHexString(options.createdBy);
  }

  // Resolve the assets the caller's teams own; fuel is scoped through the asset.
  let teamAssetOids: ObjectId[] | null = null;
  if (options.teamIds) {
    const teamOids = options.teamIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => ObjectId.createFromHexString(id));
    const assetsCol = await getAssetsCollection();
    const teamAssets = teamOids.length > 0
      ? await assetsCol
          .find(
            { tenantId: ObjectId.createFromHexString(tenantId), teamIds: { $in: teamOids } },
            { projection: { _id: 1 } },
          )
          .toArray()
      : [];
    teamAssetOids = teamAssets.map((a) => a._id);
  }

  if (options.assetId) {
    const explicit = ObjectId.createFromHexString(options.assetId);
    // Compose with team scope: an explicit asset outside the caller's teams
    // resolves to an impossible filter (empty result), never a leak.
    if (teamAssetOids && !teamAssetOids.some((id) => id.equals(explicit))) {
      filter.assetId = { $in: [] as ObjectId[] };
    } else {
      filter.assetId = explicit;
    }
  } else if (teamAssetOids) {
    filter.assetId = { $in: teamAssetOids };
  }

  if (options.driverId) {
    filter.driverId = ObjectId.createFromHexString(options.driverId);
  }

  if (options.fuelType) {
    filter.fuelType = options.fuelType;
  }

  if (options.startDate || options.endDate) {
    const dateFilter: Record<string, Date> = {};
    if (options.startDate) dateFilter.$gte = new Date(options.startDate);
    if (options.endDate) dateFilter.$lte = new Date(options.endDate);
    filter.date = dateFilter;
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ date: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  // Lookup asset & driver names for each transaction
  const assetIds = [...new Set(items.map((i) => i.assetId?.toString()).filter(Boolean))];
  const driverIds = [...new Set(items.map((i) => i.driverId?.toString()).filter(Boolean))];

  const [assetsCol, driversCol] = await Promise.all([getAssetsCollection(), getDriversCollection()]);

  const [assets, drivers] = await Promise.all([
    assetIds.length > 0
      ? assetsCol.find({ _id: { $in: assetIds.map((id) => ObjectId.createFromHexString(id)) } }).toArray()
      : [],
    driverIds.length > 0
      ? driversCol.find({ _id: { $in: driverIds.map((id) => ObjectId.createFromHexString(id)) } }).toArray()
      : [],
  ]);

  const assetMap = new Map(assets.map((a) => [a._id.toString(), a.name || a.assetName || `${a.year || ''} ${a.make || ''} ${a.model || ''}`.trim()]));
  const driverMap = new Map(drivers.map((d) => [d._id.toString(), `${d.firstName || ''} ${d.lastName || ''}`.trim()]));

  // Search filter (post-query since we search across joined names)
  let filteredItems = items;
  if (options.search) {
    const regex = new RegExp(options.search, 'i');
    filteredItems = items.filter((item) => {
      const assetName = assetMap.get(item.assetId?.toString()) || '';
      const driverName = driverMap.get(item.driverId?.toString()) || '';
      return (
        regex.test(assetName) ||
        regex.test(driverName) ||
        regex.test(item.station || '') ||
        regex.test(item.fuelType || '')
      );
    });
  }

  return {
    items: filteredItems.map((item) =>
      serializeFuelTransaction(
        item,
        assetMap.get(item.assetId?.toString()),
        driverMap.get(item.driverId?.toString()),
      ),
    ),
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

/** Get a single fuel transaction by ID. */
export async function getFuelTransactionById(tenantId: string, transactionId: string) {
  const collection = await getFuelTransactionsCollection();
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(transactionId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });

  if (!doc) return null;

  // Lookup asset & driver names
  const [assetsCol, driversCol] = await Promise.all([getAssetsCollection(), getDriversCollection()]);
  const asset = doc.assetId ? await assetsCol.findOne({ _id: doc.assetId }) : null;
  const driver = doc.driverId ? await driversCol.findOne({ _id: doc.driverId }) : null;

  const assetName = asset ? (asset.name || asset.assetName || `${asset.year || ''} ${asset.make || ''} ${asset.model || ''}`.trim()) : undefined;
  const driverName = driver ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim() : undefined;

  return serializeFuelTransaction(doc, assetName, driverName);
}

/** Create a new fuel transaction. */
export async function createFuelTransaction(
  tenantId: string,
  userId: string,
  input: CreateFuelTransactionInput,
) {
  const validation = validateCreateFuelTransactionInput(input);
  if (!validation.valid) {
    return { data: null, error: validation.errors };
  }

  const collection = await getFuelTransactionsCollection();
  const now = new Date();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);

  const metrics = calculateFuelMetrics({
    startMileage: input.startMileage,
    endMileage: input.endMileage,
    volume: input.volume,
    totalCost: input.totalCost,
  });

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    assetId: ObjectId.createFromHexString(input.assetId),
    driverId: input.driverId ? ObjectId.createFromHexString(input.driverId) : undefined,
    date: new Date(input.date),
    startMileage: input.startMileage ?? undefined,
    endMileage: input.endMileage ?? undefined,
    distance: metrics.distance,
    volume: input.volume,
    // Derived from what was actually paid — the stored triple can never
    // self-contradict (user-typed unitCost is display input only).
    unitCost: deriveUnitCost(input.volume, input.totalCost) ?? input.unitCost ?? undefined,
    totalCost: input.totalCost,
    fuelType: input.fuelType || 'diesel',
    economy: metrics.economy,
    costPerMile: metrics.costPerMile,
    station: input.station?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    source: input.source || 'manual',
    importBatchId: undefined,

    createdBy: userOid,
    updatedBy: userOid,
    createdAt: now,
    updatedAt: now,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  };

  const result = await collection.insertOne(doc);
  return {
    data: serializeFuelTransaction({ ...doc, _id: result.insertedId }),
    error: null,
  };
}

/** Update an existing fuel transaction. */
export async function updateFuelTransaction(
  tenantId: string,
  userId: string,
  transactionId: string,
  input: UpdateFuelTransactionInput,
) {
  const collection = await getFuelTransactionsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const transactionOid = ObjectId.createFromHexString(transactionId);

  const existing = await collection.findOne({
    _id: transactionOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });
  if (!existing) return { data: null, error: 'Fuel transaction not found' };

  // Merged values drive metric recompute AND validation — a one-sided edit
  // must not invert the odometer pair or corrupt the money fields.
  const mergedStart = input.startMileage ?? existing.startMileage;
  const mergedEnd = input.endMileage ?? existing.endMileage;
  const mergedVolume = input.volume ?? existing.volume;
  const mergedCost = input.totalCost ?? existing.totalCost;

  const validation = validateUpdateFuelTransactionInput(input as Record<string, unknown>, {
    startMileage: mergedStart as number | null | undefined,
    endMileage: mergedEnd as number | null | undefined,
  });
  if (!validation.valid) return { data: null, error: validation.errors };

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  if (input.assetId !== undefined) {
    $set.assetId = ObjectId.createFromHexString(input.assetId);
  }
  if (input.driverId !== undefined) {
    $set.driverId = input.driverId ? ObjectId.createFromHexString(input.driverId) : undefined;
  }
  if (input.date !== undefined) {
    $set.date = new Date(input.date);
  }
  if (input.startMileage !== undefined) $set.startMileage = input.startMileage;
  if (input.endMileage !== undefined) $set.endMileage = input.endMileage;
  if (input.volume !== undefined) $set.volume = input.volume;
  if (input.totalCost !== undefined) $set.totalCost = input.totalCost;
  if (input.fuelType !== undefined) $set.fuelType = input.fuelType;
  if (input.station !== undefined) $set.station = input.station?.trim() || undefined;
  if (input.notes !== undefined) $set.notes = input.notes?.trim() || undefined;
  if (input.source !== undefined) $set.source = input.source;

  // Keep the stored triple consistent: unitCost is derived from the merged
  // paid total and volume whenever either changes (see deriveUnitCost).
  if (input.volume !== undefined || input.totalCost !== undefined || input.unitCost !== undefined) {
    $set.unitCost =
      deriveUnitCost(mergedVolume as number, mergedCost as number) ?? input.unitCost ?? existing.unitCost;
  }

  const metrics = calculateFuelMetrics({
    startMileage: mergedStart,
    endMileage: mergedEnd,
    volume: mergedVolume,
    totalCost: mergedCost,
  });

  $set.distance = metrics.distance;
  $set.economy = metrics.economy;
  $set.costPerMile = metrics.costPerMile;

  await collection.updateOne({ _id: transactionOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: transactionOid });

  return { data: updated ? serializeFuelTransaction(updated) : null, error: null };
}

/** Permanently delete a fuel transaction. */
export async function deleteFuelTransaction(tenantId: string, userId: string, transactionId: string) {
  const collection = await getFuelTransactionsCollection();
  const transactionOid = ObjectId.createFromHexString(transactionId);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const result = await collection.deleteOne(
    { _id: transactionOid, tenantId: tenantOid },
  );

  return result.deletedCount > 0;
}

/** Get fuel analytics/summary for a tenant. */
export async function getFuelAnalytics(
  tenantId: string,
  options: {
    assetId?: string;
    startDate?: string;
    endDate?: string;
    /** Team scope — fuel is scoped through the asset (fuel docs carry no teamIds). */
    teamIds?: string[];
  },
) {
  const collection = await getFuelTransactionsCollection();

  const matchFilter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  };

  // Resolve the assets the caller's teams own; scope fuel through the asset.
  let teamAssetOids: ObjectId[] | null = null;
  if (options.teamIds) {
    const teamOids = options.teamIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => ObjectId.createFromHexString(id));
    const assetsCol = await getAssetsCollection();
    const teamAssets = teamOids.length > 0
      ? await assetsCol
          .find(
            { tenantId: ObjectId.createFromHexString(tenantId), teamIds: { $in: teamOids } },
            { projection: { _id: 1 } },
          )
          .toArray()
      : [];
    teamAssetOids = teamAssets.map((a) => a._id);
  }

  if (options.assetId) {
    const explicit = ObjectId.createFromHexString(options.assetId);
    if (teamAssetOids && !teamAssetOids.some((id) => id.equals(explicit))) {
      matchFilter.assetId = { $in: [] as ObjectId[] };
    } else {
      matchFilter.assetId = explicit;
    }
  } else if (teamAssetOids) {
    matchFilter.assetId = { $in: teamAssetOids };
  }

  if (options.startDate || options.endDate) {
    const dateFilter: Record<string, Date> = {};
    if (options.startDate) dateFilter.$gte = new Date(options.startDate);
    if (options.endDate) dateFilter.$lte = new Date(options.endDate);
    matchFilter.date = dateFilter;
  }

  const [summary] = await collection
    .aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalVolume: { $sum: '$volume' },
          totalCost: { $sum: '$totalCost' },
          totalDistance: { $sum: { $ifNull: ['$distance', 0] } },
          avgEconomy: { $avg: { $ifNull: ['$economy', null] } },
          avgCostPerMile: { $avg: { $ifNull: ['$costPerMile', null] } },
        },
      },
    ])
    .toArray();

  // Monthly breakdown — bucketed in the business timezone, not the server's
  // (a UTC server puts an NZ morning fill-up in the previous month at edges).
  const BUSINESS_TZ = 'Pacific/Auckland';
  const monthlyTrends = await collection
    .aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            year: { $year: { date: '$date', timezone: BUSINESS_TZ } },
            month: { $month: { date: '$date', timezone: BUSINESS_TZ } },
          },
          totalVolume: { $sum: '$volume' },
          totalCost: { $sum: '$totalCost' },
          totalDistance: { $sum: { $ifNull: ['$distance', 0] } },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ])
    .toArray();

  // Per-asset breakdown
  const byAsset = await collection
    .aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$assetId',
          totalVolume: { $sum: '$volume' },
          totalCost: { $sum: '$totalCost' },
          totalDistance: { $sum: { $ifNull: ['$distance', 0] } },
          transactionCount: { $sum: 1 },
          avgEconomy: { $avg: { $ifNull: ['$economy', null] } },
        },
      },
      { $sort: { totalCost: -1 } },
      { $limit: 20 },
    ])
    .toArray();

  // Lookup asset names for the breakdown
  const assetIds = byAsset.map((a) => a._id).filter(Boolean);
  let assetMap = new Map<string, string>();
  if (assetIds.length > 0) {
    const assetsCol = await getAssetsCollection();
    const assets = await assetsCol.find({ _id: { $in: assetIds } }).toArray();
    assetMap = new Map(
      assets.map((a) => [
        a._id.toString(),
        a.name || a.assetName || `${a.year || ''} ${a.make || ''} ${a.model || ''}`.trim(),
      ]),
    );
  }

  return {
    summary: summary
      ? {
          totalTransactions: summary.totalTransactions,
          totalVolume: Math.round(summary.totalVolume * 100) / 100,
          totalCost: Math.round(summary.totalCost * 100) / 100,
          totalDistance: Math.round(summary.totalDistance * 100) / 100,
          avgEconomy: summary.avgEconomy ? Math.round(summary.avgEconomy * 100) / 100 : null,
          avgCostPerMile: summary.avgCostPerMile ? Math.round(summary.avgCostPerMile * 100) / 100 : null,
        }
      : {
          totalTransactions: 0,
          totalVolume: 0,
          totalCost: 0,
          totalDistance: 0,
          avgEconomy: null,
          avgCostPerMile: null,
        },
    monthlyTrends: monthlyTrends.map((m) => ({
      year: m._id.year,
      month: m._id.month,
      totalVolume: Math.round(m.totalVolume * 100) / 100,
      totalCost: Math.round(m.totalCost * 100) / 100,
      totalDistance: Math.round(m.totalDistance * 100) / 100,
      transactionCount: m.transactionCount,
    })),
    byAsset: byAsset.map((a) => ({
      assetId: a._id?.toString(),
      assetName: assetMap.get(a._id?.toString()) || 'Unknown',
      totalVolume: Math.round(a.totalVolume * 100) / 100,
      totalCost: Math.round(a.totalCost * 100) / 100,
      totalDistance: Math.round(a.totalDistance * 100) / 100,
      transactionCount: a.transactionCount,
      avgEconomy: a.avgEconomy ? Math.round(a.avgEconomy * 100) / 100 : null,
    })),
  };
}
