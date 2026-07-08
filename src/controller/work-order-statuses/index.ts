import { ObjectId } from 'mongodb';
import { getWorkOrderStatusesCollection, getWorkOrdersCollection } from '@/lib/mongodb';
import type { CreateWorkOrderStatusInput, UpdateWorkOrderStatusInput } from './types';
import { WORK_ORDER_STATUS_TYPES, type WorkOrderStatusType } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function serialize(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    id: doc._id?.toString(),
    label: doc.label,
    color: doc.color,
    description: doc.description || undefined,
    type: doc.type ?? 'open',
    sequence: doc.sequence ?? 0,
    createdBy: doc.createdBy?.toString() || null,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
  };
}

/** Get a single work order status by ID (includes createdBy for ownership checks). */
export async function getWorkOrderStatusById(tenantId: string, id: string) {
  const col = await getWorkOrderStatusesCollection();
  const doc = await col.findOne({
    _id: ObjectId.createFromHexString(id),
    tenantId: ObjectId.createFromHexString(tenantId),
  });
  if (!doc) return null;
  return serialize(doc as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function getAllWorkOrderStatuses(tenantId: string, search?: string, options?: { showArchived?: boolean; createdBy?: string }) {
  const col = await getWorkOrderStatusesCollection();
  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
  };
  if (options?.showArchived) {
    filter.isArchived = true;
  } else {
    filter.isArchived = { $ne: true };
  }

  if (search) {
    filter.$or = [
      { label: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }
  if (options?.createdBy) {
    filter.createdBy = ObjectId.createFromHexString(options.createdBy);
  }

  const items = await col.find(filter).sort({ sequence: 1 }).toArray();

  // Get work order counts per status
  const woCol = await getWorkOrdersCollection();
  const statusIds = items.map((i) => i._id);
  const counts: Record<string, number> = {};

  if (statusIds.length > 0) {
    const pipeline = [
      {
        $match: {
          tenantId: ObjectId.createFromHexString(tenantId),
          isArchived: { $ne: true },
          statusId: { $in: statusIds },
        },
      },
      { $group: { _id: '$statusId', count: { $sum: 1 } } },
    ];
    const results = await woCol.aggregate(pipeline).toArray();
    results.forEach((r) => {
      counts[r._id.toString()] = r.count;
    });
  }

  return items.map((item) => ({
    ...serialize(item as Record<string, unknown>),
    workOrderCount: counts[item._id.toString()] || 0,
  }));
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createWorkOrderStatus(
  tenantId: string,
  userId: string,
  input: CreateWorkOrderStatusInput,
) {
  const errors: Record<string, string> = {};
  if (!isNonEmptyString(input.label)) errors.label = 'Label is required';
  if (!isNonEmptyString(input.color)) errors.color = 'Color is required';
  if (!input.type || !WORK_ORDER_STATUS_TYPES.includes(input.type as WorkOrderStatusType)) errors.type = 'Type is required';
  if (Object.keys(errors).length > 0) return { data: null, error: errors };

  const col = await getWorkOrderStatusesCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);
  const now = new Date();

  // Auto-assign next sequence
  const lastItem = await col
    .find({ tenantId: tenantOid, isArchived: { $ne: true } })
    .sort({ sequence: -1 })
    .limit(1)
    .toArray();
  const nextSequence = lastItem.length > 0 ? ((lastItem[0].sequence as number) || 0) + 1 : 1;

  const doc = {
    tenantId: tenantOid,
    label: input.label.trim(),
    color: input.color.trim(),
    description: input.description?.trim() || undefined,
    type: input.type,
    sequence: nextSequence,
    createdBy: userOid,
    updatedBy: userOid,
    createdAt: now,
    updatedAt: now,
    isArchived: false,
  };

  const result = await col.insertOne(doc);
  return { data: serialize({ ...doc, _id: result.insertedId }), error: null };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateWorkOrderStatus(
  tenantId: string,
  userId: string,
  id: string,
  input: UpdateWorkOrderStatusInput,
) {
  const col = await getWorkOrderStatusesCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const itemOid = ObjectId.createFromHexString(id);

  const existing = await col.findOne({
    _id: itemOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });
  if (!existing) return { data: null, error: 'Not found' };

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  if (input.label !== undefined) {
    if (!isNonEmptyString(input.label)) return { data: null, error: { label: 'Label is required' } };
    $set.label = input.label.trim();
  }
  if (input.color !== undefined) {
    if (!isNonEmptyString(input.color)) return { data: null, error: { color: 'Color is required' } };
    $set.color = input.color.trim();
  }
  if (input.description !== undefined) $set.description = input.description?.trim() || undefined;
  if (input.type !== undefined) {
    if (!WORK_ORDER_STATUS_TYPES.includes(input.type as WorkOrderStatusType)) return { data: null, error: { type: 'Invalid type' } };
    $set.type = input.type;
  }

  await col.updateOne({ _id: itemOid }, { $set });
  const updated = await col.findOne({ _id: itemOid });
  return { data: updated ? serialize(updated as Record<string, unknown>) : null, error: null };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteWorkOrderStatus(tenantId: string, id: string) {
  const col = await getWorkOrderStatusesCollection();
  const result = await col.deleteOne({
    _id: ObjectId.createFromHexString(id),
    tenantId: ObjectId.createFromHexString(tenantId),
  });
  return result.deletedCount > 0;
}

export async function archiveWorkOrderStatus(tenantId: string, userId: string, id: string, archived: boolean) {
  const col = await getWorkOrderStatusesCollection();
  const result = await col.updateOne(
    {
      _id: ObjectId.createFromHexString(id),
      tenantId: ObjectId.createFromHexString(tenantId),
    },
    {
      $set: {
        isArchived: archived,
        archivedAt: archived ? new Date() : null,
        archivedBy: archived ? ObjectId.createFromHexString(userId) : null,
        updatedBy: ObjectId.createFromHexString(userId),
        updatedAt: new Date(),
      },
    },
  );
  return result.modifiedCount > 0;
}
