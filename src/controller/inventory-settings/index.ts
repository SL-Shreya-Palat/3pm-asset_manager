/**
 * Inventory settings controller -- CRUD for measurement units, part categories,
 * and part locations.
 */
import { ObjectId } from 'mongodb';
import {
  getMeasurementUnitsCollection,
  getPartCategoriesCollection,
  getPartLocationsCollection,
} from '@/lib/mongodb';
import { isNonEmptyString } from '@/lib/validation/commonValidators';
import {
  isCommandConnectionEnabled,
  MASTER_DATA_MANAGED_MESSAGE,
} from '@/controller/command-connection/guard';
import { ensureFreshFromCommand } from '@/controller/command-connection/auto-sync';
import type {
  CreateMeasurementUnitInput,
  CreatePartCategoryInput,
  CreatePartLocationInput,
} from './types';

/** Serialize a settings document. */
function serialize(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    id: doc._id?.toString(),
    name: doc.name,
    symbol: doc.symbol || undefined,
    description: doc.description || undefined,
    isDefault: doc.isDefault ?? false,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
    // Command linkage — 'command'-sourced lookups badge as read-only master data.
    source: doc.source || 'local',
    commandSyncedAt: doc.commandSyncedAt ? (doc.commandSyncedAt as Date).toISOString() : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Measurement Units
// ═══════════════════════════════════════════════════════════════════════════

export async function getAllMeasurementUnits(tenantId: string, search?: string, options?: { showArchived?: boolean; userId?: string }) {
  // Fresh on every call: pull the latest Command units before reading local, so
  // new/changed records show on this load (no-op when standalone).
  await ensureFreshFromCommand(tenantId, options?.userId, 'units');

  const col = await getMeasurementUnitsCollection();
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
      { name: { $regex: search, $options: 'i' } },
      { symbol: { $regex: search, $options: 'i' } },
    ];
  }
  const items = await col.find(filter).sort({ name: 1 }).toArray();
  return items.map(serialize);
}

export async function createMeasurementUnit(tenantId: string, userId: string, input: CreateMeasurementUnitInput) {
  // Connected tenants add units in Command, then they sync here automatically.
  if (await isCommandConnectionEnabled(tenantId)) {
    return { data: null, error: MASTER_DATA_MANAGED_MESSAGE };
  }
  const errors: Record<string, string> = {};
  if (!isNonEmptyString(input.name)) errors.name = 'Name is required';
  if (!isNonEmptyString(input.symbol)) errors.symbol = 'Symbol is required';
  if (Object.keys(errors).length > 0) return { data: null, error: errors };

  const col = await getMeasurementUnitsCollection();
  const now = new Date();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);

  const doc = {
    tenantId: tenantOid,
    name: input.name.trim(),
    symbol: input.symbol.trim(),
    description: input.description?.trim() || undefined,
    createdBy: userOid, updatedBy: userOid,
    createdAt: now, updatedAt: now,
    isArchived: false,
  };
  const result = await col.insertOne(doc);
  return { data: serialize({ ...doc, _id: result.insertedId }), error: null };
}

export async function updateMeasurementUnit(tenantId: string, userId: string, id: string, input: Partial<CreateMeasurementUnitInput>) {
  const col = await getMeasurementUnitsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const itemOid = ObjectId.createFromHexString(id);
  const existing = await col.findOne({ _id: itemOid, tenantId: tenantOid, isArchived: { $ne: true } });
  if (!existing) return { data: null, error: 'Not found' };
  // Command-mastered units are read-only here while connected.
  if (existing.source === 'command' && (await isCommandConnectionEnabled(tenantId))) {
    return { data: null, error: MASTER_DATA_MANAGED_MESSAGE };
  }

  const $set: Record<string, unknown> = { updatedBy: ObjectId.createFromHexString(userId), updatedAt: new Date() };
  if (input.name !== undefined) $set.name = input.name.trim();
  if (input.symbol !== undefined) $set.symbol = input.symbol.trim();
  if (input.description !== undefined) $set.description = input.description?.trim() || undefined;

  await col.updateOne({ _id: itemOid }, { $set });
  const updated = await col.findOne({ _id: itemOid });
  return { data: updated ? serialize(updated) : null, error: null };
}

export async function deleteMeasurementUnit(tenantId: string, id: string) {
  const col = await getMeasurementUnitsCollection();
  const result = await col.deleteOne(
    { _id: ObjectId.createFromHexString(id), tenantId: ObjectId.createFromHexString(tenantId) },
  );
  return result.deletedCount > 0;
}

export async function archiveMeasurementUnit(tenantId: string, userId: string, id: string, archived: boolean) {
  const col = await getMeasurementUnitsCollection();
  const result = await col.updateOne(
    { _id: ObjectId.createFromHexString(id), tenantId: ObjectId.createFromHexString(tenantId) },
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

// ═══════════════════════════════════════════════════════════════════════════
// Part Categories
// ═══════════════════════════════════════════════════════════════════════════

export async function getAllPartCategories(tenantId: string, search?: string, options?: { showArchived?: boolean }) {
  const col = await getPartCategoriesCollection();
  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
  };
  if (options?.showArchived) {
    filter.isArchived = true;
  } else {
    filter.isArchived = { $ne: true };
  }
  if (search) {
    filter.name = { $regex: search, $options: 'i' };
  }
  const items = await col.find(filter).sort({ name: 1 }).toArray();
  return items.map(serialize);
}

export async function createPartCategory(tenantId: string, userId: string, input: CreatePartCategoryInput) {
  const errors: Record<string, string> = {};
  if (!isNonEmptyString(input.name)) errors.name = 'Category name is required';
  if (Object.keys(errors).length > 0) return { data: null, error: errors };

  const col = await getPartCategoriesCollection();
  const now = new Date();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);

  const doc = {
    tenantId: tenantOid,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    createdBy: userOid, updatedBy: userOid,
    createdAt: now, updatedAt: now,
    isArchived: false,
  };
  const result = await col.insertOne(doc);
  return { data: serialize({ ...doc, _id: result.insertedId }), error: null };
}

export async function updatePartCategory(tenantId: string, userId: string, id: string, input: Partial<CreatePartCategoryInput>) {
  const col = await getPartCategoriesCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const itemOid = ObjectId.createFromHexString(id);
  const existing = await col.findOne({ _id: itemOid, tenantId: tenantOid, isArchived: { $ne: true } });
  if (!existing) return { data: null, error: 'Not found' };

  const $set: Record<string, unknown> = { updatedBy: ObjectId.createFromHexString(userId), updatedAt: new Date() };
  if (input.name !== undefined) $set.name = input.name.trim();
  if (input.description !== undefined) $set.description = input.description?.trim() || undefined;

  await col.updateOne({ _id: itemOid }, { $set });
  const updated = await col.findOne({ _id: itemOid });
  return { data: updated ? serialize(updated) : null, error: null };
}

export async function deletePartCategory(tenantId: string, id: string) {
  const col = await getPartCategoriesCollection();
  const result = await col.deleteOne(
    { _id: ObjectId.createFromHexString(id), tenantId: ObjectId.createFromHexString(tenantId) },
  );
  return result.deletedCount > 0;
}

export async function archivePartCategory(tenantId: string, userId: string, id: string, archived: boolean) {
  const col = await getPartCategoriesCollection();
  const result = await col.updateOne(
    { _id: ObjectId.createFromHexString(id), tenantId: ObjectId.createFromHexString(tenantId) },
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

// ═══════════════════════════════════════════════════════════════════════════
// Part Locations
// ═══════════════════════════════════════════════════════════════════════════

export async function getAllPartLocations(tenantId: string, search?: string, options?: { showArchived?: boolean; userId?: string }) {
  // Fresh on every call: pull the latest Command company locations before
  // reading local, so new/changed records show on this load (no-op standalone).
  await ensureFreshFromCommand(tenantId, options?.userId, 'partLocations');

  const col = await getPartLocationsCollection();
  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
  };
  if (options?.showArchived) {
    filter.isArchived = true;
  } else {
    filter.isArchived = { $ne: true };
  }
  if (search) {
    filter.name = { $regex: search, $options: 'i' };
  }
  const items = await col.find(filter).sort({ name: 1 }).toArray();
  return items.map(serialize);
}

export async function createPartLocation(tenantId: string, userId: string, input: CreatePartLocationInput) {
  // Connected tenants add locations in Command, then they sync here automatically.
  if (await isCommandConnectionEnabled(tenantId)) {
    return { data: null, error: MASTER_DATA_MANAGED_MESSAGE };
  }
  const errors: Record<string, string> = {};
  if (!isNonEmptyString(input.name)) errors.name = 'Part location is required';
  if (Object.keys(errors).length > 0) return { data: null, error: errors };

  const col = await getPartLocationsCollection();
  const now = new Date();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);

  // If setting as default, unset current default
  if (input.isDefault) {
    await col.updateMany(
      { tenantId: tenantOid, isDefault: true, isArchived: { $ne: true } },
      { $set: { isDefault: false, updatedAt: now } },
    );
  }

  const doc = {
    tenantId: tenantOid,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    isDefault: input.isDefault ?? false,
    createdBy: userOid, updatedBy: userOid,
    createdAt: now, updatedAt: now,
    isArchived: false,
  };
  const result = await col.insertOne(doc);
  return { data: serialize({ ...doc, _id: result.insertedId }), error: null };
}

export async function updatePartLocation(tenantId: string, userId: string, id: string, input: Partial<CreatePartLocationInput>) {
  const col = await getPartLocationsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const itemOid = ObjectId.createFromHexString(id);
  const existing = await col.findOne({ _id: itemOid, tenantId: tenantOid, isArchived: { $ne: true } });
  if (!existing) return { data: null, error: 'Not found' };
  // Command-mastered locations are read-only here while connected.
  if (existing.source === 'command' && (await isCommandConnectionEnabled(tenantId))) {
    return { data: null, error: MASTER_DATA_MANAGED_MESSAGE };
  }

  const now = new Date();
  // If setting as default, unset current default
  if (input.isDefault) {
    await col.updateMany(
      { tenantId: tenantOid, isDefault: true, _id: { $ne: itemOid }, isArchived: { $ne: true } },
      { $set: { isDefault: false, updatedAt: now } },
    );
  }

  const $set: Record<string, unknown> = { updatedBy: ObjectId.createFromHexString(userId), updatedAt: now };
  if (input.name !== undefined) $set.name = input.name.trim();
  if (input.description !== undefined) $set.description = input.description?.trim() || undefined;
  if (input.isDefault !== undefined) $set.isDefault = input.isDefault;

  await col.updateOne({ _id: itemOid }, { $set });
  const updated = await col.findOne({ _id: itemOid });
  return { data: updated ? serialize(updated) : null, error: null };
}

export async function deletePartLocation(tenantId: string, id: string) {
  const col = await getPartLocationsCollection();
  const result = await col.deleteOne(
    { _id: ObjectId.createFromHexString(id), tenantId: ObjectId.createFromHexString(tenantId) },
  );
  return result.deletedCount > 0;
}

export async function archivePartLocation(tenantId: string, userId: string, id: string, archived: boolean) {
  const col = await getPartLocationsCollection();
  const result = await col.updateOne(
    { _id: ObjectId.createFromHexString(id), tenantId: ObjectId.createFromHexString(tenantId) },
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

