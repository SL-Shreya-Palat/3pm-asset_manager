/**
 * Buddy AI — Request context type
 *
 * Tool exposure is decided per request by the tool registry
 * (tools/registry.ts) using permission strings and the PermissionChecker.
 */

import type { SparsePermissions } from "@/lib/rbac";
import type { PermissionChecker } from "@/lib/rbac";

export type BuddyAIRole = {
  _id: string;
  name: string;
  permissions: SparsePermissions;
  isSystem: boolean;
};

export type BuddyAIContext = {
  userId: string;
  tenantId: string;
  tenantName?: string;
  role: BuddyAIRole;
  /** Pre-built checker for O(1) permission lookups. */
  checker: PermissionChecker;
};
