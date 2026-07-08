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
    createdBy: doc.createdBy?.toString() ?? null,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Measurement Units
// ═══════════════════════════════════════════════════════════════════════════

export async function getAllMeasurementUnits(tenantId: string, search?: string, options?: { showArchived?: boolean; createdBy?: string }) {
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
  if (options?.createdBy) {
    filter.createdBy = ObjectId.createFromHexString(options.createdBy);
  }
  const items = await col.find(filter).sort({ name: 1 }).toArray();
  return items.map(serialize);
}

export async function createMeasurementUnit(tenantId: string, userId: string, input: CreateMeasurementUnitInput) {
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

export async function getAllPartCategories(tenantId: string, search?: string, options?: { showArchived?: boolean; createdBy?: string }) {
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
  if (options?.createdBy) {
    filter.createdBy = ObjectId.createFromHexString(options.createdBy);
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

export async function getAllPartLocations(tenantId: string, search?: string, options?: { showArchived?: boolean; createdBy?: string }) {
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
  if (options?.createdBy) {
    filter.createdBy = ObjectId.createFromHexString(options.createdBy);
  }
  const items = await col.find(filter).sort({ name: 1 }).toArray();
  return items.map(serialize);
}

export async function createPartLocation(tenantId: string, userId: string, input: CreatePartLocationInput) {
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

