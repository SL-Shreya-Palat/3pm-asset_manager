/**
 * Asset Types controller — CRUD for tenant-scoped asset types.
 */
import { ObjectId } from 'mongodb';
import { getAssetTypesCollection } from '@/lib/mongodb';
import { isNonEmptyString } from '@/lib/validation/commonValidators';

/** Get a single asset type by ID (includes createdBy for ownership checks). */
export async function getAssetTypeById(tenantId: string, assetTypeId: string) {
  const collection = await getAssetTypesCollection();
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(assetTypeId),
    tenantId: ObjectId.createFromHexString(tenantId),
  });
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description || '',
    createdBy: doc.createdBy?.toString() || null,
    createdAt: doc.createdAt?.toISOString(),
  };
}

/** List all asset types for a tenant. */
export async function getAllAssetTypes(tenantId: string, search?: string, options?: { showArchived?: boolean; createdBy?: string }) {
  const collection = await getAssetTypesCollection();
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
  const items = await collection
    .find(filter)
    .sort({ name: 1 })
    .toArray();

  return items.map((item) => ({
    id: item._id.toString(),
    name: item.name,
    description: item.description || '',
    createdBy: item.createdBy?.toString() || null,
    createdAt: item.createdAt?.toISOString(),
  }));
}

/** Create a new asset type. */
export async function createAssetType(
  tenantId: string,
  userId: string,
  input: { name: string; description?: string },
) {
  if (!isNonEmptyString(input.name)) {
    return { data: null, error: 'Name is required' };
  }

  const collection = await getAssetTypesCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const nameLower = input.name.trim().toLowerCase();

  // Check uniqueness
  const existing = await collection.findOne({
    tenantId: tenantOid,
    nameLower,
    isArchived: { $ne: true },
  });
  if (existing) {
    return { data: null, error: 'An asset type with this name already exists' };
  }

  const now = new Date();
  const userOid = ObjectId.createFromHexString(userId);

  const doc = {
    tenantId: tenantOid,
    name: input.name.trim(),
    nameLower,
    description: input.description?.trim() || '',
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

  return {
    data: {
      id: result.insertedId.toString(),
      name: doc.name,
      description: doc.description,
    },
    error: null,
  };
}

/** Update an asset type (name, description). */
export async function updateAssetType(
  tenantId: string,
  userId: string,
  assetTypeId: string,
  input: { name?: string; description?: string },
) {
  const collection = await getAssetTypesCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const typeOid = ObjectId.createFromHexString(assetTypeId);

  const existing = await collection.findOne({
    _id: typeOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });
  if (!existing) return { data: null, error: 'Asset type not found' };

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    const nameLower = input.name.trim().toLowerCase();
    // Check uniqueness (excluding self)
    const duplicate = await collection.findOne({
      tenantId: tenantOid,
      nameLower,
      _id: { $ne: typeOid },
      isArchived: { $ne: true },
    });
    if (duplicate) return { data: null, error: 'An asset type with this name already exists' };
    $set.name = input.name.trim();
    $set.nameLower = nameLower;
  }

  if (input.description !== undefined) {
    $set.description = input.description.trim();
  }

  await collection.updateOne({ _id: typeOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: typeOid });

  return {
    data: updated
      ? {
          id: updated._id.toString(),
          name: updated.name,
          description: updated.description || '',
        }
      : null,
    error: null,
  };
}

/** Permanently delete an asset type. */
export async function deleteAssetType(tenantId: string, assetTypeId: string) {
  const collection = await getAssetTypesCollection();
  const result = await collection.deleteOne({
    _id: ObjectId.createFromHexString(assetTypeId),
    tenantId: ObjectId.createFromHexString(tenantId),
  });
  return result.deletedCount > 0;
}

/** Archive or unarchive an asset type. */
export async function archiveAssetType(tenantId: string, userId: string, assetTypeId: string, archived: boolean) {
  const collection = await getAssetTypesCollection();
  const result = await collection.updateOne(
    {
      _id: ObjectId.createFromHexString(assetTypeId),
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
