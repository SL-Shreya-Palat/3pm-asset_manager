/**
 * Server-side permission helpers — resolves a user's permission levels from
 * their role in the database.  Used by API routes to enforce "OWN" scoping.
 */
import { ObjectId } from 'mongodb';
import { getTenantMembersCollection, getRolesCollection, getTenantsCollection } from '@/lib/mongodb';
import {
  SparsePermissionIndex,
  isSparsePermissions,
  isWildcardPermissions,
} from '@/lib/rbac';
import type { SparsePermissions, ViewLevel, EditLevel, ArchiveLevel, DeleteLevel } from '@/lib/rbac';

export interface FormPermissionLevels {
  fullAccess: boolean;
  view: ViewLevel;
  create: boolean;
  edit: EditLevel;
  archive: ArchiveLevel;
  delete: DeleteLevel;
}

/**
 * Build a SparsePermissionIndex for the given user + tenant.
 * Returns `{ index, fullAccess }`.  fullAccess is true for admin/owner roles
 * or wildcard permission sets.
 */
async function buildPermissionIndex(
  userId: string,
  tenantId: string,
): Promise<{ index: SparsePermissionIndex; fullAccess: boolean }> {
  const index = new SparsePermissionIndex();

  if (!ObjectId.isValid(userId) || !ObjectId.isValid(tenantId)) {
    return { index, fullAccess: false };
  }

  const [tenantMembersCol, rolesCol, tenantsCol] = await Promise.all([
    getTenantMembersCollection(),
    getRolesCollection(),
    getTenantsCollection(),
  ]);

  // Check if user is tenant owner
  const tenant = await tenantsCol.findOne({ _id: ObjectId.createFromHexString(tenantId) });
  const isOwner = tenant?.ownerId?.toString() === userId;

  if (isOwner) {
    index.build({ v: 2, forms: ['*'], m: ['*'], sm: [] });
    return { index, fullAccess: true };
  }

  const member = await tenantMembersCol.findOne({
    userId: ObjectId.createFromHexString(userId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isActive: true,
  });

  if (!member?.roleId) {
    return { index, fullAccess: false };
  }

  const role = await rolesCol.findOne({ _id: member.roleId as ObjectId });
  if (!role) {
    return { index, fullAccess: false };
  }

  // Admin/owner roles get full access
  const nameLower = ((role.nameLower as string) || '').toLowerCase();
  if (role.isAdmin === true || nameLower === 'admin' || nameLower === 'owner') {
    index.build({ v: 2, forms: ['*'], m: ['*'], sm: [] });
    return { index, fullAccess: true };
  }

  const permissions = role.permissions;
  if (isSparsePermissions(permissions)) {
    if (isWildcardPermissions(permissions as SparsePermissions)) {
      index.build({ v: 2, forms: ['*'], m: ['*'], sm: [] });
      return { index, fullAccess: true };
    }
    index.build(permissions as SparsePermissions);
  }

  return { index, fullAccess: false };
}

/**
 * Get the user's permission levels for a specific form.
 *
 * @param userId   - The authenticated user's ID
 * @param tenantId - The current tenant's ID
 * @param formId   - The form identifier, e.g. "maintenance.defects.defect"
 */
export async function getFormPermissionLevels(
  userId: string,
  tenantId: string,
  formId: string,
): Promise<FormPermissionLevels> {
  const { index, fullAccess } = await buildPermissionIndex(userId, tenantId);

  if (fullAccess) {
    return {
      fullAccess: true,
      view: 'ALL',
      create: true,
      edit: 'ALL',
      archive: 'ALL',
      delete: 'ALL',
    };
  }

  return {
    fullAccess: false,
    view: index.getViewLevel(formId),
    create: index.getCreatePermission(formId),
    edit: index.getEditLevel(formId),
    archive: index.getArchiveLevel(formId),
    delete: index.getDeleteLevel(formId),
  };
}
