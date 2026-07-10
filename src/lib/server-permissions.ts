/**
 * Server-side permission helpers — resolves a user's permission levels from
 * their role in the database.  Used by API routes to enforce "OWN" scoping.
 */
import { ObjectId } from 'mongodb';
import { getTenantMembersCollection, getRolesCollection, getTenantsCollection } from '@/lib/mongodb';
import { ACTIVE_MEMBER_FILTER } from '@/lib/auth-helper';
import {
  SparsePermissionIndex,
  isSparsePermissions,
  isWildcardPermissions,
} from '@/lib/rbac';
import type { SparsePermissions, ViewLevel, EditLevel, ArchiveLevel, DeleteLevel, InspectLevel } from '@/lib/rbac';

export interface FormPermissionLevels {
  fullAccess: boolean;
  mobileOnly: boolean;
  /**
   * When the member's role is team-scoped, the team IDs the member belongs to.
   * `null` means unrestricted (role is not team-scoped, or full access).
   * An empty array means team-scoped but in no teams — sees nothing team-bound.
   */
  teamIds: string[] | null;
  view: ViewLevel;
  create: boolean;
  inspect: InspectLevel;
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
): Promise<{ index: SparsePermissionIndex; fullAccess: boolean; mobileOnly: boolean; teamIds: string[] | null }> {
  const index = new SparsePermissionIndex();

  if (!ObjectId.isValid(userId) || !ObjectId.isValid(tenantId)) {
    return { index, fullAccess: false, mobileOnly: false, teamIds: null };
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
    return { index, fullAccess: true, mobileOnly: false, teamIds: null };
  }

  // Same activity filter as session/tenant resolution (auth-helper) so an
  // archived or still-pending membership never resolves permissions.
  const member = await tenantMembersCol.findOne({
    userId: ObjectId.createFromHexString(userId),
    tenantId: ObjectId.createFromHexString(tenantId),
    ...ACTIVE_MEMBER_FILTER,
  });

  if (!member?.roleId) {
    return { index, fullAccess: false, mobileOnly: false, teamIds: null };
  }

  const role = await rolesCol.findOne({ _id: member.roleId as ObjectId });
  if (!role) {
    return { index, fullAccess: false, mobileOnly: false, teamIds: null };
  }

  const roleMobileOnly = role.mobileOnly === true;

  // Admin roles get full access
  if (role.isAdmin === true) {
    index.build({ v: 2, forms: ['*'], m: ['*'], sm: [] });
    return { index, fullAccess: true, mobileOnly: false, teamIds: null };
  }

  // Team-scoped roles are restricted to the teams the member belongs to.
  const teamIds: string[] | null =
    role.teamScoped === true
      ? (Array.isArray(member.teamMemberships) ? member.teamMemberships : [])
          .map((m: { teamId?: ObjectId }) => m?.teamId?.toString())
          .filter((id): id is string => !!id)
      : null;

  const permissions = role.permissions;
  if (isSparsePermissions(permissions)) {
    if (isWildcardPermissions(permissions as SparsePermissions)) {
      index.build({ v: 2, forms: ['*'], m: ['*'], sm: [] });
      return { index, fullAccess: true, mobileOnly: roleMobileOnly, teamIds: null };
    }
    index.build(permissions as SparsePermissions);
  }

  return { index, fullAccess: false, mobileOnly: roleMobileOnly, teamIds };
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
  const { index, fullAccess, mobileOnly, teamIds } = await buildPermissionIndex(userId, tenantId);

  if (fullAccess) {
    return {
      fullAccess: true,
      mobileOnly,
      teamIds: null,
      view: 'ALL',
      create: true,
      inspect: 'ALL',
      edit: 'ALL',
      archive: 'ALL',
      delete: 'ALL',
    };
  }

  return {
    fullAccess: false,
    mobileOnly,
    teamIds,
    view: index.getViewLevel(formId),
    create: index.getCreatePermission(formId),
    inspect: index.getInspectLevel(formId),
    edit: index.getEditLevel(formId),
    archive: index.getArchiveLevel(formId),
    delete: index.getDeleteLevel(formId),
  };
}
