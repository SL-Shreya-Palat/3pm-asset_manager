/**
 * Parts controller -- CRUD business logic for the parts (inventory) collection.
 */
import { ObjectId } from 'mongodb';
import { getPartsCollection, getCountersCollection } from '@/lib/mongodb';
import { validateCreatePartInput, serializePart } from './utils';
import {
  isCommandConnectionEnabled,
  stripCommandOwnedFields,
  MASTER_DATA_MANAGED_MESSAGE,
} from '@/controller/command-connection/guard';
import { ensureFreshFromCommand } from '@/controller/command-connection/auto-sync';
import type { CreatePartInput, UpdatePartInput } from './types';

/**
 * Generate the next system stock number (STK-0001) using an atomic per-tenant
 * counter. Stock numbers are system-generated and immutable. Skips any value
 * that already exists (e.g. a legacy manually-entered number) so it stays unique.
 */
async function generateStockNumber(tenantOid: ObjectId): Promise<string> {
  const counters = await getCountersCollection();
  const parts = await getPartsCollection();

  for (let attempt = 0; attempt < 50; attempt++) {
    const result = await counters.findOneAndUpdate(
      { _id: `stk_${tenantOid.toString()}` as unknown as ObjectId, tenantId: tenantOid },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
    const seq = (result?.seq as number) || 1;
    const candidate = `STK-${String(seq).padStart(4, '0')}`;
    const exists = await parts.findOne({ tenantId: tenantOid, partNumber: candidate });
    if (!exists) return candidate;
  }
  // Fallback (extremely unlikely): guarantee uniqueness via the counter value.
  const fallback = await counters.findOneAndUpdate(
    { _id: `stk_${tenantOid.toString()}` as unknown as ObjectId, tenantId: tenantOid },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return `STK-${String((fallback?.seq as number) || 1).padStart(6, '0')}`;
}

/**
 * Preview the next stock number WITHOUT consuming it. Used by the create form
 * to show the projected STK-xxxx before the stock item is saved. The value
 * actually assigned on save comes from generateStockNumber().
 */
export async function peekNextStockNumber(tenantId: string): Promise<string> {
  const counters = await getCountersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const doc = await counters.findOne({
    _id: `stk_${tenantOid.toString()}` as unknown as ObjectId,
    tenantId: tenantOid,
  });
  const next = ((doc?.seq as number) || 0) + 1;
  return `STK-${String(next).padStart(4, '0')}`;
}

/** List parts with pagination, search, and optional category filter. */
export async function getAllParts(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; categoryId?: string; showArchived?: boolean; userId?: string; createdBy?: string },
) {
  // Fresh on every call: pull the latest Command stock before reading local, so
  // new/changed records show on this load (no-op when standalone).
  await ensureFreshFromCommand(tenantId, options.userId, 'stock');

  const collection = await getPartsCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
  };

  // "OWN" view scope — only show records created by this user
  if (options.createdBy) {
    filter.createdBy = ObjectId.createFromHexString(options.createdBy);
  }

  if (options.showArchived) {
    filter.isArchived = true;
  } else {
    filter.isArchived = { $ne: true };
  }

  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    filter.$or = [
      { name: regex },
      { partNumber: regex },
      { description: regex },
    ];
  }

  if (options.categoryId) {
    filter.categoryId = ObjectId.createFromHexString(options.categoryId);
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => serializePart(item)),
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

/** Get a single part by ID. */
export async function getPartById(tenantId: string, partId: string) {
  const collection = await getPartsCollection();
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(partId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });
  if (!doc) return null;
  return serializePart(doc);
}

/** Create a new part. */
export async function createPart(tenantId: string, userId: string, input: CreatePartInput) {
  // Connected tenants add stock in Command, then import — never locally.
  if (await isCommandConnectionEnabled(tenantId)) {
    return { data: null, error: MASTER_DATA_MANAGED_MESSAGE };
  }

  const collection = await getPartsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);

  // Stock number is system-generated and immutable — never user-supplied.
  const partNumber = await generateStockNumber(tenantOid);

  const validation = validateCreatePartInput({ ...input, partNumber });
  if (!validation.valid) return { data: null, error: validation.errors };

  const now = new Date();
  const userOid = ObjectId.createFromHexString(userId);

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    name: input.name.trim(),
    partNumber,
    upc: input.upc?.trim() || undefined,
    description: input.description?.trim() || undefined,
    photoUrl: input.photoUrl || undefined,
    manufacturerId: input.manufacturerId ? ObjectId.createFromHexString(input.manufacturerId) : undefined,
    measurementUnitId: input.measurementUnitId ? ObjectId.createFromHexString(input.measurementUnitId) : undefined,
    categoryId: input.categoryId ? ObjectId.createFromHexString(input.categoryId) : undefined,
    reorderPoint: input.reorderPoint ?? undefined,
    maximumQuantity: input.maximumQuantity ?? undefined,
    vendors: (input.vendors || []).map((v) => ({
      vendorId: ObjectId.createFromHexString(v.vendorId),
      unitCost: v.unitCost,
    })),
    stockLocations: (input.stockLocations || []).map((s) => ({
      locationId: ObjectId.createFromHexString(s.locationId),
      quantity: s.quantity,
    })),
    createdBy: userOid,
    updatedBy: userOid,
    createdAt: now,
    updatedAt: now,
    isActive: true,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  };

  const result = await collection.insertOne(doc);
  return { data: serializePart({ ...doc, _id: result.insertedId }), error: null };
}

/** Update an existing part. */
export async function updatePart(
  tenantId: string,
  userId: string,
  partId: string,
  input: UpdatePartInput,
) {
  const collection = await getPartsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const partOid = ObjectId.createFromHexString(partId);

  const existing = await collection.findOne({
    _id: partOid, tenantId: tenantOid, isArchived: { $ne: true },
  });
  if (!existing) return { data: null, error: 'Part not found' };

  // Command-sourced stock: identity + quantities are owned by Command —
  // strip them from local edits (AM-only fields still save).
  if (existing.source === 'command') {
    const guarded = stripCommandOwnedFields(input as Record<string, unknown>, 'parts');
    input = guarded.input as UpdatePartInput;
    if (guarded.stripped.length > 0) {
      console.warn(
        `[parts] Ignored Command-owned field edit on ${partId}: ${guarded.stripped.join(', ')}`,
      );
    }
  }

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) return { data: null, error: { name: 'Stock name is required' } };
    $set.name = trimmed;
  }

  if (input.partNumber !== undefined) {
    const trimmed = input.partNumber.trim();
    if (!trimmed) return { data: null, error: { partNumber: 'Stock number is required' } };
    // Check uniqueness
    const dup = await collection.findOne({
      tenantId: tenantOid, partNumber: trimmed, _id: { $ne: partOid }, isArchived: { $ne: true },
    });
    if (dup) return { data: null, error: { partNumber: 'Stock number already exists' } };
    $set.partNumber = trimmed;
  }

  if (input.upc !== undefined) $set.upc = input.upc?.trim() || undefined;
  if (input.description !== undefined) $set.description = input.description?.trim() || undefined;
  if (input.photoUrl !== undefined) $set.photoUrl = input.photoUrl || undefined;
  if (input.manufacturerId !== undefined) $set.manufacturerId = input.manufacturerId ? ObjectId.createFromHexString(input.manufacturerId) : undefined;
  if (input.measurementUnitId !== undefined) $set.measurementUnitId = input.measurementUnitId ? ObjectId.createFromHexString(input.measurementUnitId) : undefined;
  if (input.categoryId !== undefined) $set.categoryId = input.categoryId ? ObjectId.createFromHexString(input.categoryId) : undefined;
  if (input.reorderPoint !== undefined) $set.reorderPoint = input.reorderPoint ?? undefined;
  if (input.maximumQuantity !== undefined) $set.maximumQuantity = input.maximumQuantity ?? undefined;

  if (input.vendors !== undefined) {
    $set.vendors = (input.vendors || []).map((v) => ({
      vendorId: ObjectId.createFromHexString(v.vendorId),
      unitCost: v.unitCost,
    }));
  }

  if (input.stockLocations !== undefined) {
    $set.stockLocations = (input.stockLocations || []).map((s) => ({
      locationId: ObjectId.createFromHexString(s.locationId),
      quantity: s.quantity,
    }));
  }

  await collection.updateOne({ _id: partOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: partOid });
  return { data: updated ? serializePart(updated) : null, error: null };
}

/** Permanently delete a part. */
export async function deletePart(tenantId: string, userId: string, partId: string) {
  const collection = await getPartsCollection();
  const docOid = ObjectId.createFromHexString(partId);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const result = await collection.deleteOne({ _id: docOid, tenantId: tenantOid });
  return result.deletedCount > 0;
}
