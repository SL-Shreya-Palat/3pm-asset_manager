/**
 * Role controller -- CRUD business logic for roles collection.
 * MongoDB native driver, no Mongoose/ODM.
 */
import { ObjectId } from 'mongodb';
import { getRolesCollection } from '@/lib/mongodb';
import { validateCreateRoleInput, serializeRole } from './utils';
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
    isActive: true,
  };

  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    filter.$or = [{ name: regex }, { nameLower: regex }, { description: regex }];
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
    isActive: true,
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
    nameLower: input.name.trim().toLowerCase(),
    isActive: true,
  });
  if (existing) {
    return { data: null, error: { name: 'A role with this name already exists' } };
  }

  const now = new Date();
  const userOid = ObjectId.createFromHexString(userId);

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    name: input.name.trim(),
    nameLower: input.name.trim().toLowerCase(),
    description: input.description?.trim() || undefined,
    baseCostPerHour: input.baseCostPerHour ?? 0,
    chargeOutRate: input.chargeOutRate ?? 0,
    permissions: input.permissions,
    isSystem: false,

    createdBy: userOid,
    updatedBy: userOid,
    createdAt: now,
    updatedAt: now,
    isActive: true,
    isManager: input.isManager ?? null,
    isTeamManager: input.isTeamManager ?? null,
    isMechanic: input.isMechanic ?? null,
    isDriver: input.isDriver ?? null,
    isAdmin: input.isAdmin ?? null,
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
    isActive: true,
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
      nameLower: trimmed.toLowerCase(),
      isActive: true,
    });
    if (duplicate) {
      return { data: null, error: { name: 'A role with this name already exists' } };
    }

    $set.name = trimmed;
    $set.nameLower = trimmed.toLowerCase();
  }

  if (input.description !== undefined) $set.description = input.description?.trim() || undefined;
  if (input.permissions !== undefined) $set.permissions = input.permissions;
  if (input.baseCostPerHour !== undefined) $set.baseCostPerHour = input.baseCostPerHour ?? 0;
  if (input.chargeOutRate !== undefined) $set.chargeOutRate = input.chargeOutRate ?? 0;
  if (input.isManager !== undefined) $set.isManager = input.isManager ?? null;
  if (input.isTeamManager !== undefined) $set.isTeamManager = input.isTeamManager ?? null;
  if (input.isMechanic !== undefined) $set.isMechanic = input.isMechanic ?? null;
  if (input.isDriver !== undefined) $set.isDriver = input.isDriver ?? null;
  if (input.isAdmin !== undefined) $set.isAdmin = input.isAdmin ?? null;

  await collection.updateOne({ _id: roleOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: roleOid });

  return { data: updated ? serializeRole(updated) : null, error: null };
}

/** Delete a role (set isActive to false). */
export async function deleteRole(tenantId: string, userId: string, roleId: string) {
  const collection = await getRolesCollection();

  // Prevent deleting system roles
  const existing = await collection.findOne({
    _id: ObjectId.createFromHexString(roleId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isActive: true,
  });
  if (!existing) return false;
  if (existing.isSystem) return false;

  const result = await collection.updateOne(
    {
      _id: ObjectId.createFromHexString(roleId),
      tenantId: ObjectId.createFromHexString(tenantId),
      isActive: true,
    },
    {
      $set: {
        isActive: false,
        updatedBy: ObjectId.createFromHexString(userId),
        updatedAt: new Date(),
      },
    },
  );

  return result.modifiedCount > 0;
}
