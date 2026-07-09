/**
 * Role controller -- CRUD business logic for roles collection.
 * MongoDB native driver, no Mongoose/ODM.
 */
import { ObjectId } from 'mongodb';
import { getRolesCollection, getTenantMembersCollection } from '@/lib/mongodb';
import { validateCreateRoleInput, serializeRole } from './utils';
import type { CreateRoleInput, UpdateRoleInput } from './types';

/** List roles with pagination and search. */
export async function getAllRoles(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; showArchived?: boolean },
) {
  const collection = await getRolesCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
  };

  if (options.showArchived) {
    filter.isArchived = true;
  } else {
    filter.isArchived = { $ne: true };
  }

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

  // Defense-in-depth: deny creating admin or wildcard-permission roles.
  if (input.isAdmin === true) {
    return { data: null, error: { isAdmin: 'Cannot create an admin role' } };
  }
  if (Array.isArray(input.permissions?.forms) && input.permissions.forms[0] === '*') {
    return { data: null, error: { permissions: 'Wildcard permissions are not allowed' } };
  }

  const collection = await getRolesCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);

  // Check for duplicate name
  const existing = await collection.findOne({
    tenantId: tenantOid,
    nameLower: input.name.trim().toLowerCase(),
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
    nameLower: input.name.trim().toLowerCase(),
    description: input.description?.trim() || undefined,
    baseCostPerHour: input.baseCostPerHour ?? 0,
    chargeOutRate: input.chargeOutRate ?? 0,
    permissions: input.permissions,
    teamScoped: input.teamScoped ?? false,
    mobileOnly: input.mobileOnly ?? false,
    isSystem: false,
    type: 'custom',

    createdBy: userOid,
    updatedBy: userOid,
    createdAt: now,
    updatedAt: now,
    isActive: true,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
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
    isArchived: { $ne: true },
  });
  if (!existing) return { data: null, error: 'Role not found' };

  // Prevent editing system roles
  if (existing.isSystem) {
    return { data: null, error: 'System roles cannot be modified' };
  }

  // Defense-in-depth: deny escalation to admin or wildcard-permission roles.
  if (input.isAdmin === true) {
    return { data: null, error: { isAdmin: 'Cannot set admin flag' } };
  }
  if (input.permissions !== undefined) {
    if (Array.isArray(input.permissions.forms) && input.permissions.forms[0] === '*') {
      return { data: null, error: { permissions: 'Wildcard permissions are not allowed' } };
    }
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
      isArchived: { $ne: true },
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
  if (input.teamScoped !== undefined) $set.teamScoped = input.teamScoped ?? false;
  if (input.mobileOnly !== undefined) $set.mobileOnly = input.mobileOnly ?? false;
  if (input.isManager !== undefined) $set.isManager = input.isManager ?? null;
  if (input.isTeamManager !== undefined) $set.isTeamManager = input.isTeamManager ?? null;
  if (input.isMechanic !== undefined) $set.isMechanic = input.isMechanic ?? null;
  if (input.isDriver !== undefined) $set.isDriver = input.isDriver ?? null;
  if (input.isAdmin !== undefined) $set.isAdmin = input.isAdmin ?? null;

  await collection.updateOne({ _id: roleOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: roleOid });

  return { data: updated ? serializeRole(updated) : null, error: null };
}

/** Permanently delete a role. */
export async function deleteRole(
  tenantId: string,
  userId: string,
  roleId: string,
): Promise<boolean | { error: string }> {
  const collection = await getRolesCollection();
  const roleOid = ObjectId.createFromHexString(roleId);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  // Prevent deleting system roles
  const existing = await collection.findOne({ _id: roleOid, tenantId: tenantOid });
  if (!existing) return false;
  if (existing.isSystem) return false;

  // Check for assigned members
  const membersCol = await getTenantMembersCollection();
  const assignedCount = await membersCol.countDocuments({
    tenantId: tenantOid,
    roleId: roleOid,
    isActive: true,
  });
  if (assignedCount > 0) {
    return {
      error: `Cannot delete role: ${assignedCount} active member(s) are assigned to it`,
    };
  }

  const result = await collection.deleteOne({ _id: roleOid, tenantId: tenantOid });
  return result.deletedCount > 0;
}
