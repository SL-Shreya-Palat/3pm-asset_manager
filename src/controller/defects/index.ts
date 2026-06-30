/**
 * Defects controller — CRUD operations for defects.
 */
import { ObjectId } from 'mongodb';
import {
  getDefectsCollection,
  getAssetsCollection,
  getDriversCollection,
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
  options: { page?: number; limit?: number; search?: string; status?: string; priority?: string; severity?: string; teamId?: string },
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

  // Filter by team: find assets belonging to the team, then filter defects by those asset IDs
  if (options.teamId) {
    const teamOid = ObjectId.createFromHexString(options.teamId);
    const assetsCol = await getAssetsCollection();
    const teamAssets = await assetsCol
      .find({ tenantId: tenantOid, teamIds: teamOid, isArchived: { $ne: true } }, { projection: { _id: 1 } })
      .toArray();
    const assetIds = teamAssets.map((a) => a._id);
    filter.assetId = { $in: assetIds };
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

  return {
    items: items.map((item) => serializeDefect(item as unknown as Record<string, unknown>)),
    pagination: { page, limit, total, hasMore: skip + limit < total },
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
