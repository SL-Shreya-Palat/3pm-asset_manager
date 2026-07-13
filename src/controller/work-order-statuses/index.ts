import { ObjectId } from 'mongodb';
import { getWorkOrderStatusesCollection, getWorkOrdersCollection, getTenantsCollection } from '@/lib/mongodb';
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
    isSystem: doc.isSystem === true,
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

export async function deleteWorkOrderStatus(
  tenantId: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const col = await getWorkOrderStatusesCollection();
  const statusOid = ObjectId.createFromHexString(id);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const existing = await col.findOne({ _id: statusOid, tenantId: tenantOid });
  if (!existing) return { ok: false, error: 'Not found' };

  // System-generated (default) statuses can never be deleted.
  if (existing.isSystem === true) {
    return { ok: false, error: 'System-generated statuses can’t be deleted.' };
  }

  const result = await col.deleteOne({ _id: statusOid, tenantId: tenantOid });
  return result.deletedCount > 0 ? { ok: true } : { ok: false, error: 'Not found' };
}

// ---------------------------------------------------------------------------
// Seeding (default statuses for a new tenant)
// ---------------------------------------------------------------------------

/**
 * Default work order statuses created for a brand-new tenant — one per
 * lifecycle phase, covering the standard maintenance work-order flow.
 */
const DEFAULT_WORK_ORDER_STATUSES: Array<{ label: string; color: string; type: WorkOrderStatusType }> = [
  { label: 'Open', color: '#3B82F6', type: 'open' },
  { label: 'Pending', color: '#EAB308', type: 'on_hold' },
  { label: 'In Progress', color: '#F59E0B', type: 'in_progress' },
  { label: 'Completed', color: '#22C55E', type: 'completed' },
  { label: 'Cancelled', color: '#EF4444', type: 'cancelled' },
];

/**
 * Seed the default work order statuses for a tenant.
 *
 * Runs at most ONCE per tenant, guarded by the tenant's `workOrderStatusesSeeded`
 * flag — so after the first pass a tenant's own edits/deletions are respected
 * and defaults never reappear. On that first pass it only inserts the default
 * lifecycle types the tenant is MISSING, so an existing status (e.g. a manually
 * created 'On Hold') is never duplicated.
 *
 * Result:
 * - brand-new tenant → all five defaults created;
 * - existing tenant with a few statuses → only the missing types are backfilled;
 * - already-seeded tenant → no-op.
 *
 * Non-fatal by convention (callers wrap in try/catch); safe on every pass.
 */
export async function seedWorkOrderStatuses(tenantId: string, userId: string): Promise<void> {
  if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(userId)) return;

  const tenantsCol = await getTenantsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);

  // One-time per tenant: once seeded we never touch statuses again.
  const tenant = await tenantsCol.findOne(
    { _id: tenantOid },
    { projection: { workOrderStatusesSeeded: 1 } },
  );
  if (!tenant || tenant.workOrderStatusesSeeded) return;

  const col = await getWorkOrderStatusesCollection();

  // Skip default types the tenant already has (archived included), so we never
  // duplicate a status the user created or archived.
  const existingTypes = (await col.distinct('type', { tenantId: tenantOid })) as string[];
  const existingTypeSet = new Set(existingTypes);
  const missing = DEFAULT_WORK_ORDER_STATUSES.filter((s) => !existingTypeSet.has(s.type));

  if (missing.length > 0) {
    const userOid = ObjectId.createFromHexString(userId);
    const now = new Date();

    // Continue numbering after the tenant's current highest sequence.
    const last = await col.find({ tenantId: tenantOid }).sort({ sequence: -1 }).limit(1).toArray();
    let seq = last.length > 0 ? ((last[0].sequence as number) || 0) : 0;

    const docs = missing.map((s) => ({
      tenantId: tenantOid,
      label: s.label,
      color: s.color,
      description: undefined,
      type: s.type,
      sequence: ++seq,
      // Seeded defaults are core lifecycle statuses — protected from archive/delete.
      isSystem: true,
      createdBy: userOid,
      updatedBy: userOid,
      createdAt: now,
      updatedAt: now,
      isArchived: false,
    }));

    await col.insertMany(docs);
  }

  // Mark seeded so this only ever runs once per tenant.
  await tenantsCol.updateOne({ _id: tenantOid }, { $set: { workOrderStatusesSeeded: true } });
}

export async function archiveWorkOrderStatus(
  tenantId: string,
  userId: string,
  id: string,
  archived: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const col = await getWorkOrderStatusesCollection();
  const statusOid = ObjectId.createFromHexString(id);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const existing = await col.findOne({ _id: statusOid, tenantId: tenantOid });
  if (!existing) return { ok: false, error: 'Not found' };

  // System-generated (default) statuses are part of the core lifecycle — never
  // archivable. (Unarchiving a legacy-archived one is still allowed.)
  if (archived && existing.isSystem === true) {
    return { ok: false, error: 'System-generated statuses can’t be archived.' };
  }

  const result = await col.updateOne(
    { _id: statusOid, tenantId: tenantOid },
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
  return result.modifiedCount > 0 ? { ok: true } : { ok: false, error: 'Not found' };
}
