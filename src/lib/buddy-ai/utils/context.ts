/**
 * Buddy AI — Context resolver
 *
 * Resolves user + tenant + role permissions into BuddyAIContext.
 * Mirrors the tenantMember → role → permissions logic in auth-helper,
 * including the owner override (tenant.ownerId always gets full access).
 */

import { ObjectId } from "mongodb";
import {
  getRolesCollection,
  getTenantMembersCollection,
  getTenantsCollection,
} from "@/lib/mongodb";
import {
  PermissionChecker,
  isSparsePermissions,
  type SparsePermissions,
} from "@/lib/rbac";
import type { BuddyAIContext, BuddyAIRole } from "@/lib/buddy-ai/utils/rbac";

export type ResolveContextUser = {
  id: string;
  currentTenantId: string | null;
};

/** Member without a role sees nothing until a role is assigned. */
const NO_ACCESS_PERMISSIONS: SparsePermissions = {
  v: 2,
  forms: [],
  m: [],
  sm: [],
};

const OWNER_PERMISSIONS: SparsePermissions = {
  v: 2,
  forms: ["*"],
  m: ["*"],
  sm: [],
};

/**
 * Resolve Buddy AI context from authenticated user.
 *
 * @throws "Unauthorized" — user has no id
 * @throws "Please select an organization first" — user has no currentTenantId
 * @throws "Tenant membership not found" — user is not a member of the tenant
 */
export async function resolveContext(
  user: ResolveContextUser | null
): Promise<BuddyAIContext> {
  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  if (!user.currentTenantId) {
    throw new Error("Please select an organization first");
  }

  const tenantId = user.currentTenantId;
  const tenantObjectId = ObjectId.createFromHexString(tenantId);
  const tenantMembersCollection = await getTenantMembersCollection();

  const tenantMemberDoc = await tenantMembersCollection.findOne(
    {
      userId: ObjectId.createFromHexString(user.id),
      tenantId: tenantObjectId,
      isActive: true,
    },
    { projection: { roleId: 1 } }
  );

  if (!tenantMemberDoc) {
    throw new Error("Tenant membership not found");
  }

  const tenantsCollection = await getTenantsCollection();
  const tenantDoc = await tenantsCollection.findOne(
    { _id: tenantObjectId },
    { projection: { name: 1, ownerId: 1 } }
  );

  const isOwner = tenantDoc?.ownerId?.toString() === user.id;
  const roleId = tenantMemberDoc.roleId as ObjectId | undefined;

  let role: BuddyAIRole;
  if (isOwner) {
    // Owner always has full access, regardless of the linked role doc.
    role = {
      _id: roleId?.toString() ?? "",
      name: "Owner",
      permissions: OWNER_PERMISSIONS,
      isSystem: true,
    };
  } else {
    let roleDoc: Record<string, unknown> | null = null;
    if (roleId) {
      const rolesCollection = await getRolesCollection();
      roleDoc = await rolesCollection.findOne({
        _id: roleId,
        tenantId: tenantObjectId,
      });
    }

    const rawPermissions = roleDoc?.permissions;
    const permissions: SparsePermissions = isSparsePermissions(rawPermissions)
      ? (rawPermissions as SparsePermissions)
      : NO_ACCESS_PERMISSIONS;

    role = {
      _id: roleId?.toString() ?? "",
      name: (roleDoc?.name as string) ?? "",
      permissions,
      isSystem: Boolean(roleDoc?.isSystem),
    };
  }

  // Build a PermissionChecker for O(1) lookups throughout the request.
  const checker = new PermissionChecker();
  checker.initialize(role.permissions);

  return {
    userId: user.id,
    tenantId,
    tenantName: tenantDoc?.name as string | undefined,
    role,
    checker,
  };
}
