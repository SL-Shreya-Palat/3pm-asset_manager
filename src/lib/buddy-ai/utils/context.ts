/**
 * Buddy AI — Context resolver
 *
 * Resolves user + tenant + permissions into BuddyAIContext.
 * Reuses logic from /api/me/permissions (tenantMember → role → permissions).
 */

import { ObjectId } from "mongodb";
import { getTenantMembersCollection, getTenantsCollection } from "@/lib/mongodb";
import { getRoleById } from "@/controller/roles";
import { PermissionChecker, type RolePermissions } from "@/lib/permission-helpers";
import {
  buildAllowedTools,
  type BuddyAIContext,
} from "@/lib/buddy-ai/utils/rbac";

export type ResolveContextUser = {
  id: string;
  currentTenantId: string | null;
};

const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  v: 2,
  forms: [],
  m: [],
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
  const tenantMembersCollection = await getTenantMembersCollection();

  const tenantMemberDoc = await tenantMembersCollection.findOne(
    {
      userId: ObjectId.createFromHexString(user.id),
      tenantId: ObjectId.createFromHexString(tenantId),
      isActive: true,
    },
    { projection: { roleId: 1 } }
  );

  if (!tenantMemberDoc) {
    throw new Error("Tenant membership not found");
  }

  const roleId = tenantMemberDoc.roleId as ObjectId | undefined;
  const tenantObjectId = ObjectId.createFromHexString(tenantId);

  let rolePermissions: RolePermissions = DEFAULT_ROLE_PERMISSIONS;
  if (roleId) {
    const role = await getRoleById(roleId.toString(), tenantObjectId);
    rolePermissions = role?.permissions ?? DEFAULT_ROLE_PERMISSIONS;
  }

  const permissionChecker = new PermissionChecker();
  permissionChecker.initialize(rolePermissions);

  const allowedTools = buildAllowedTools(permissionChecker);

  let tenantName: string | undefined;
  try {
    const tenantsCollection = await getTenantsCollection();
    const tenantDoc = await tenantsCollection.findOne(
      { _id: tenantObjectId },
      { projection: { name: 1 } }
    );
    tenantName = tenantDoc?.name;
  } catch {
    // Optional; ignore
  }

  return {
    userId: user.id,
    tenantId,
    tenantName,
    rolePermissions,
    permissionChecker,
    allowedTools,
  };
}
