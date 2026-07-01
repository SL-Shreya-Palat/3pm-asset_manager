/**
 * Defects controller — CRUD operations for defects.
 */
import { ObjectId } from 'mongodb';
import {
  getDefectsCollection,
  getAssetsCollection,
  getDriversCollection,
  getTeamsCollection,
} from '@/lib/mongodb';
import type { CreateDefectInput, UpdateDefectInput } from './types';
import {
  validateCreateDefectInput,
  serializeDefect,
  generateDefectNumber,
} from './utils';

// ─── List ────────────────────────────────────────────────────────────────────

export async function getAllDefects(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; status?: string; priority?: string; severity?: string; teamId?: string; assetId?: string },
) {
  const collection = await getDefectsCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const tenantOid = ObjectId.createFromHexString(tenantId);

  const filter: Record<string, unknown> = {
    tenantId: tenantOid,
    isArchived: { $ne: true },
  };

  if (options.status) {
    filter.status = options.status;
  }

  if (options.priority) {
    filter.priority = options.priority;
  }

  if (options.severity) {
    filter.severity = options.severity;
  }

  // Filter by team: use direct teamIds array on defect documents
  if (options.teamId) {
    filter.teamIds = ObjectId.createFromHexString(options.teamId);
  }

  // Filter by asset (e.g. the work-order form's "defects to correct" picker)
  if (options.assetId && ObjectId.isValid(options.assetId)) {
    filter.assetId = ObjectId.createFromHexString(options.assetId);
  }

  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    filter.$or = [
      { defectNumber: regex },
      { name: regex },
      { assetName: regex },
      { driverName: regex },
    ];
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  // Populate team names
  const allTeamIds = items
    .flatMap((item) => (Array.isArray(item.teamIds) ? item.teamIds : []))
    .filter((id) => id) as ObjectId[];
  const uniqueTeamIds = [...new Map(allTeamIds.map((id) => [id.toString(), id])).values()];

  let teamNameMap = new Map<string, string>();
  if (uniqueTeamIds.length > 0) {
    const teamsCollection = await getTeamsCollection();
    const teamDocs = await teamsCollection.find({ _id: { $in: uniqueTeamIds } }).toArray();
    teamNameMap = new Map(teamDocs.map((t) => [t._id.toString(), t.name as string]));
  }

  return {
    items: items.map((item) => {
      const itemTeamIds = Array.isArray(item.teamIds)
        ? (item.teamIds as ObjectId[]).map((id) => id.toString())
        : [];
      const teamNames = itemTeamIds.map((id) => teamNameMap.get(id)).filter(Boolean) as string[];
      return serializeDefect(item as unknown as Record<string, unknown>, { teamNames });
    }),
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

// ─── Exception summary (Exception Report KPIs) ───────────────────────────────

export async function getDefectSummary(tenantId: string) {
  const col = await getDefectsCollection();
  const assetsCol = await getAssetsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const base = { tenantId: tenantOid, isArchived: { $ne: true } };

  const [total, newCount, inProgress, corrected, noCorrection, criticalOpen, outOfService] =
    await Promise.all([
      col.countDocuments(base),
      col.countDocuments({ ...base, status: 'new' }),
      col.countDocuments({ ...base, status: 'in_progress' }),
      col.countDocuments({ ...base, status: 'corrected' }),
      col.countDocuments({ ...base, status: 'no_correction_needed' }),
      col.countDocuments({ ...base, status: { $in: ['new', 'in_progress'] }, severity: 'critical' }),
      assetsCol.countDocuments({ tenantId: tenantOid, status: 'out_of_service', isArchived: { $ne: true } }),
    ]);

  return {
    total,
    open: newCount + inProgress,
    new: newCount,
    inProgress,
    corrected,
    noCorrection,
    criticalOpen,
    outOfService,
  };
}

// ─── Exceptions grouped by asset (Exception Report — fleet-safety view) ───────

/**
 * Group exceptions (defects) under their asset for the fleet-safety view.
 * Grounded assets (status = out_of_service) float to the top, then assets with
 * the most critical-open exceptions. Each group carries the live asset name and
 * its exceptions serialized like the flat list.
 */
export async function getExceptionsByAsset(
  tenantId: string,
  options: { status?: string; severity?: string; search?: string } = {},
) {
  const col = await getDefectsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const match: Record<string, unknown> = {
    tenantId: tenantOid,
    isArchived: { $ne: true },
  };

  // 'open' is a virtual status = new + in_progress; 'all' means no status filter.
  if (options.status === 'open') {
    match.status = { $in: ['new', 'in_progress'] };
  } else if (options.status && options.status !== 'all') {
    match.status = options.status;
  }

  if (options.severity && options.severity !== 'all') {
    match.severity = options.severity;
  }

  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    match.$or = [
      { defectNumber: regex },
      { name: regex },
      { assetName: regex },
      { driverName: regex },
    ];
  }

  const openStatuses = ['new', 'in_progress'];

  const groups = await col
    .aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$assetId',
          storedAssetName: { $first: '$assetName' },
          exceptions: { $push: '$$ROOT' },
          total: { $sum: 1 },
          openCount: {
            $sum: { $cond: [{ $in: ['$status', openStatuses] }, 1, 0] },
          },
          criticalOpenCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$severity', 'critical'] }, { $in: ['$status', openStatuses] }] },
                1,
                0,
              ],
            },
          },
          latest: { $max: '$createdAt' },
        },
      },
      { $lookup: { from: 'assets', localField: '_id', foreignField: '_id', as: 'asset' } },
      {
        $addFields: {
          assetName: {
            $ifNull: [{ $arrayElemAt: ['$asset.name', 0] }, '$storedAssetName'],
          },
          outOfService: {
            $eq: [{ $arrayElemAt: ['$asset.status', 0] }, 'out_of_service'],
          },
        },
      },
      { $project: { asset: 0 } },
      { $sort: { outOfService: -1, criticalOpenCount: -1, openCount: -1, latest: -1 } },
    ])
    .toArray();

  return {
    groups: groups.map((g) => ({
      assetId: g._id ? (g._id as ObjectId).toString() : null,
      assetName: (g.assetName as string) || 'Unassigned',
      outOfService: Boolean(g.outOfService),
      total: g.total as number,
      openCount: g.openCount as number,
      criticalOpenCount: g.criticalOpenCount as number,
      exceptions: (g.exceptions as Array<Record<string, unknown>>).map((d) => serializeDefect(d)),
    })),
  };
}

// ─── Get by ID ───────────────────────────────────────────────────────────────

export async function getDefectById(tenantId: string, id: string) {
  const collection = await getDefectsCollection();
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(id),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });

  return doc ? serializeDefect(doc as unknown as Record<string, unknown>) : null;
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createDefect(
  tenantId: string,
  userId: string,
  input: CreateDefectInput,
) {
  const validation = validateCreateDefectInput(input);
  if (!validation.valid) {
    return { data: null, error: validation.errors };
  }

  const collection = await getDefectsCollection();
  const now = new Date();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);

  // Generate defect number
  const defectNumber = await generateDefectNumber(tenantId);

  // Resolve asset name
  let assetName = '';
  try {
    const assetsCol = await getAssetsCollection();
    const asset = await assetsCol.findOne({
      _id: ObjectId.createFromHexString(input.assetId),
      tenantId: tenantOid,
    });
    assetName = (asset?.name as string) || '';
  } catch {
    // Silent — assetName stays empty
  }

  // Resolve driver name
  let driverId: ObjectId | null = null;
  let driverName: string | null = null;
  if (input.driverId) {
    driverId = ObjectId.createFromHexString(input.driverId);
    try {
      const driversCol = await getDriversCollection();
      const driver = await driversCol.findOne({
        _id: driverId,
        tenantId: tenantOid,
      });
      if (driver) {
        driverName = `${(driver.firstName as string) || ''} ${(driver.lastName as string) || ''}`.trim() || null;
      }
    } catch {
      // Silent
    }
  }

  const doc = {
    tenantId: tenantOid,
    defectNumber,
    name: input.name.trim(),
    date: new Date(input.date),
    comment: input.comment.trim(),
    assetId: ObjectId.createFromHexString(input.assetId),
    assetName,
    driverId,
    driverName,
    priority: input.priority,
    severity: input.severity,
    status: input.status || 'new',
    attachments: (input.attachments || []).map((a) => ({
      url: a.url,
      filename: a.filename,
      originalName: a.originalName,
      contentType: a.contentType,
      size: a.size,
      uploadedAt: now,
    })),
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
    data: serializeDefect({ ...doc, _id: result.insertedId } as unknown as Record<string, unknown>),
    error: null,
  };
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateDefect(
  tenantId: string,
  userId: string,
  id: string,
  input: UpdateDefectInput,
) {
  const collection = await getDefectsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const oid = ObjectId.createFromHexString(id);

  const existing = await collection.findOne({
    _id: oid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });
  if (!existing) return { data: null, error: 'Defect not found' };

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  if (input.name !== undefined) $set.name = input.name.trim();
  if (input.date !== undefined) $set.date = new Date(input.date);
  if (input.comment !== undefined) $set.comment = input.comment.trim();
  if (input.priority !== undefined) $set.priority = input.priority;
  if (input.severity !== undefined) $set.severity = input.severity;
  if (input.status !== undefined) $set.status = input.status;

  // Re-resolve asset name if changed
  if (input.assetId !== undefined) {
    $set.assetId = ObjectId.createFromHexString(input.assetId);
    try {
      const assetsCol = await getAssetsCollection();
      const asset = await assetsCol.findOne({
        _id: ObjectId.createFromHexString(input.assetId),
        tenantId: tenantOid,
      });
      $set.assetName = (asset?.name as string) || '';
    } catch {
      $set.assetName = '';
    }
  }

  // Re-resolve driver name if changed
  if (input.driverId !== undefined) {
    if (input.driverId) {
      $set.driverId = ObjectId.createFromHexString(input.driverId);
      try {
        const driversCol = await getDriversCollection();
        const driver = await driversCol.findOne({
          _id: ObjectId.createFromHexString(input.driverId),
          tenantId: tenantOid,
        });
        $set.driverName = driver
          ? `${(driver.firstName as string) || ''} ${(driver.lastName as string) || ''}`.trim() || null
          : null;
      } catch {
        $set.driverName = null;
      }
    } else {
      $set.driverId = null;
      $set.driverName = null;
    }
  }

  if (input.attachments !== undefined) {
    $set.attachments = input.attachments.map((a) => ({
      url: a.url,
      filename: a.filename,
      originalName: a.originalName,
      contentType: a.contentType,
      size: a.size,
      uploadedAt: new Date(),
    }));
  }

  await collection.updateOne({ _id: oid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: oid });

  return {
    data: updated ? serializeDefect(updated as unknown as Record<string, unknown>) : null,
    error: null,
  };
}

// ─── Delete (soft) ───────────────────────────────────────────────────────────

export async function deleteDefect(tenantId: string, userId: string, id: string) {
  const collection = await getDefectsCollection();
  const result = await collection.updateOne(
    {
      _id: ObjectId.createFromHexString(id),
      tenantId: ObjectId.createFromHexString(tenantId),
      isArchived: { $ne: true },
    },
    {
      $set: {
        isArchived: true,
        archivedAt: new Date(),
        archivedBy: ObjectId.createFromHexString(userId),
        updatedBy: ObjectId.createFromHexString(userId),
        updatedAt: new Date(),
      },
    },
  );

  return result.modifiedCount > 0;
}

// ─── Team assignment ─────────────────────────────────────────────────────────

/** Bulk-add a team to multiple defects. */
export async function addTeamToDefects(
  tenantId: string,
  userId: string,
  teamId: string,
  defectIds: string[],
) {
  const collection = await getDefectsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const teamOid = ObjectId.createFromHexString(teamId);
  const userOid = ObjectId.createFromHexString(userId);
  const defectOids = defectIds.map((id) => ObjectId.createFromHexString(id));

  const result = await collection.updateMany(
    {
      _id: { $in: defectOids },
      tenantId: tenantOid,
      isArchived: { $ne: true },
    },
    {
      $addToSet: { teamIds: teamOid },
      $set: { updatedBy: userOid, updatedAt: new Date() },
    },
  );

  return result.modifiedCount;
}

/** Remove a team from a defect. */
export async function removeTeamFromDefect(
  tenantId: string,
  userId: string,
  teamId: string,
  defectId: string,
) {
  const collection = await getDefectsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const teamOid = ObjectId.createFromHexString(teamId);
  const defectOid = ObjectId.createFromHexString(defectId);
  const userOid = ObjectId.createFromHexString(userId);

  const result = await collection.updateOne(
    {
      _id: defectOid,
      tenantId: tenantOid,
      isArchived: { $ne: true },
    },
    {
      $pull: { teamIds: teamOid },
      $set: { updatedBy: userOid, updatedAt: new Date() },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  );

  return result.modifiedCount > 0;
}

// ─── Bulk Status Update ──────────────────────────────────────────────────────

export async function bulkUpdateDefectStatus(
  tenantId: string,
  userId: string,
  ids: string[],
  status: string,
) {
  if (!ids.length) return { data: null, error: 'No defect IDs provided' };

  const { DEFECT_STATUSES } = await import('./types');
  if (!(DEFECT_STATUSES as readonly string[]).includes(status)) {
    return { data: null, error: `Status must be one of: ${DEFECT_STATUSES.join(', ')}` };
  }

  const collection = await getDefectsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const now = new Date();

  const result = await collection.updateMany(
    {
      _id: { $in: ids.map((id) => ObjectId.createFromHexString(id)) },
      tenantId: tenantOid,
      isArchived: { $ne: true },
    },
    {
      $set: {
        status,
        updatedBy: ObjectId.createFromHexString(userId),
        updatedAt: now,
      },
    },
  );

  return { data: { modifiedCount: result.modifiedCount }, error: null };
}
