/**
 * Asset Types controller — CRUD for tenant-scoped asset types.
 */
import { ObjectId } from 'mongodb';
import { getAssetTypesCollection } from '@/lib/mongodb';
import { isNonEmptyString } from '@/lib/validation/commonValidators';

/** List all asset types for a tenant. */
export async function getAllAssetTypes(tenantId: string, search?: string) {
  const collection = await getAssetTypesCollection();
  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  };
  if (search) {
    filter.name = { $regex: search, $options: 'i' };
  }
  const items = await collection
    .find(filter)
    .sort({ name: 1 })
    .toArray();

  return items.map((item) => ({
    id: item._id.toString(),
    name: item.name,
    description: item.description || '',
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

/** Archive an asset type. */
export async function deleteAssetType(tenantId: string, userId: string, assetTypeId: string) {
  const collection = await getAssetTypesCollection();
  const result = await collection.updateOne(
    {
      _id: ObjectId.createFromHexString(assetTypeId),
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
