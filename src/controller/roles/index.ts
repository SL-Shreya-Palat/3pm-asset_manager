/**
 * Role controller -- CRUD business logic for roles collection.
 * MongoDB native driver, no Mongoose/ODM.
 */
import { ObjectId } from 'mongodb';
import { getRolesCollection } from '@/lib/mongodb';
import { validateCreateRoleInput, generateRoleKey, serializeRole } from './utils';
import type { CreateRoleInput, UpdateRoleInput } from './types';

/** List roles with pagination and search. */
export async function getAllRoles(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string },
) {
  const collection = await getRolesCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  };

  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    filter.$or = [{ name: regex }, { key: regex }, { description: regex }];
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ isSystem: -1, createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  const serialized = items.map((item) => serializeRole(item));

  return {
    items: serialized,
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

/** Get a single role by ID. */
export async function getRoleById(tenantId: string, roleId: string) {
  const collection = await getRolesCollection();
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(roleId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });

  if (!doc) return null;
  return serializeRole(doc);
}

/** Create a new role. */
export async function createRole(tenantId: string, userId: string, input: CreateRoleInput) {
  const validation = validateCreateRoleInput(input);
  if (!validation.valid) {
    return { data: null, error: validation.errors };
  }

  const collection = await getRolesCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);

  // Check for duplicate name
  const existing = await collection.findOne({
    tenantId: tenantOid,
    name: { $regex: `^${input.name.trim()}$`, $options: 'i' },
    isArchived: { $ne: true },
  });
  if (existing) {
    return { data: null, error: { name: 'A role with this name already exists' } };
  }

  const now = new Date();
  const userOid = ObjectId.createFromHexString(userId);

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    name: input.name.trim(),
    key: generateRoleKey(input.name),
    description: input.description?.trim() || undefined,
    permissions: input.permissions,
    isSystem: false,

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
    data: serializeRole({ ...doc, _id: result.insertedId }),
    error: null,
  };
}

/** Update an existing role. */
export async function updateRole(
  tenantId: string,
  userId: string,
  roleId: string,
  input: UpdateRoleInput,
) {
  const collection = await getRolesCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const roleOid = ObjectId.createFromHexString(roleId);

  const existing = await collection.findOne({
    _id: roleOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });
  if (!existing) return { data: null, error: 'Role not found' };

  // Prevent editing system roles
  if (existing.isSystem) {
    return { data: null, error: 'System roles cannot be modified' };
  }

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) return { data: null, error: { name: 'Role name is required' } };

    // Check for duplicate name (excluding current)
    const duplicate = await collection.findOne({
      tenantId: tenantOid,
      _id: { $ne: roleOid },
      name: { $regex: `^${trimmed}$`, $options: 'i' },
      isArchived: { $ne: true },
    });
    if (duplicate) {
      return { data: null, error: { name: 'A role with this name already exists' } };
    }

    $set.name = trimmed;
    $set.key = generateRoleKey(trimmed);
  }

  if (input.description !== undefined) $set.description = input.description?.trim() || undefined;
  if (input.permissions !== undefined) $set.permissions = input.permissions;

  await collection.updateOne({ _id: roleOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: roleOid });

  return { data: updated ? serializeRole(updated) : null, error: null };
}

/** Archive (soft-delete) a role. */
export async function deleteRole(tenantId: string, userId: string, roleId: string) {
  const collection = await getRolesCollection();

  // Prevent deleting system roles
  const existing = await collection.findOne({
    _id: ObjectId.createFromHexString(roleId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });
  if (!existing) return false;
  if (existing.isSystem) return false;

  const result = await collection.updateOne(
    {
      _id: ObjectId.createFromHexString(roleId),
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
