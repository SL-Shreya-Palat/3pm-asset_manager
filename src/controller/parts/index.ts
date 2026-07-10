/**
 * Parts controller -- CRUD business logic for the parts (inventory) collection.
 */
import { ObjectId } from 'mongodb';
import { getPartsCollection } from '@/lib/mongodb';
import { validateCreatePartInput, serializePart } from './utils';
import {
  isCommandConnectionEnabled,
  stripCommandOwnedFields,
  MASTER_DATA_MANAGED_MESSAGE,
} from '@/controller/command-connection/guard';
import { ensureFreshFromCommand } from '@/controller/command-connection/auto-sync';
import type { CreatePartInput, UpdatePartInput } from './types';

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
  const and: Record<string, unknown>[] = [];

  // "OWN" view scope — only show records created by this user, BUT always
  // include Command-imported master data. Imported stock isn't "owned" by any
  // single AM user (its createdBy is whoever first triggered the auto-sync), so
  // scoping it by createdBy would hide all Command stock from OWN-scoped users.
  if (options.createdBy) {
    and.push({
      $or: [
        { createdBy: ObjectId.createFromHexString(options.createdBy) },
        { source: 'command' },
      ],
    });
  }

  if (options.showArchived) {
    filter.isArchived = true;
  } else {
    filter.isArchived = { $ne: true };
  }

  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    and.push({
      $or: [
        { name: regex },
        { partNumber: regex },
        { description: regex },
      ],
    });
  }

  if (options.categoryId) {
    filter.categoryId = ObjectId.createFromHexString(options.categoryId);
  }

  if (and.length > 0) filter.$and = and;

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

  const validation = validateCreatePartInput(input);
  if (!validation.valid) return { data: null, error: validation.errors };

  const collection = await getPartsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);

  // Check unique stock number within tenant
  const existing = await collection.findOne({
    tenantId: tenantOid,
    partNumber: input.partNumber.trim(),
    isArchived: { $ne: true },
  });
  if (existing) {
    return { data: null, error: { partNumber: 'Stock number already exists' } };
  }

  const now = new Date();
  const userOid = ObjectId.createFromHexString(userId);

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    name: input.name.trim(),
    partNumber: input.partNumber.trim(),
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
  // strip them from local edits (AM-only fields still save). The caller gets
  // an explicit warning: a silent "saved successfully" for a write that
  // changed nothing (e.g. a stock-count correction) is a lie.
  let strippedWarning: string | undefined;
  if (existing.source === 'command') {
    const guarded = stripCommandOwnedFields(input as Record<string, unknown>, 'parts');
    input = guarded.input as UpdatePartInput;
    if (guarded.stripped.length > 0) {
      strippedWarning =
        'This stock item is managed in Command — name, number, description and stock levels were not changed. Update them in Command.';
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
  return {
    data: updated ? serializePart(updated) : null,
    error: null,
    ...(strippedWarning ? { warning: strippedWarning } : {}),
  };
}

/**
 * Permanently delete a part. Command-sourced stock can't be deleted while
 * connected: the next sync would recreate it under a NEW _id, orphaning every
 * WO/PO line that references the old one.
 */
export async function deletePart(
  tenantId: string,
  userId: string,
  partId: string,
): Promise<{ deleted: boolean; error: string | null }> {
  const collection = await getPartsCollection();
  const docOid = ObjectId.createFromHexString(partId);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const existing = await collection.findOne(
    { _id: docOid, tenantId: tenantOid },
    { projection: { source: 1 } },
  );
  if (!existing) return { deleted: false, error: 'Part not found' };
  if (existing.source === 'command' && (await isCommandConnectionEnabled(tenantId))) {
    return { deleted: false, error: MASTER_DATA_MANAGED_MESSAGE };
  }

  const result = await collection.deleteOne({ _id: docOid, tenantId: tenantOid });
  return { deleted: result.deletedCount > 0, error: result.deletedCount > 0 ? null : 'Part not found' };
}
