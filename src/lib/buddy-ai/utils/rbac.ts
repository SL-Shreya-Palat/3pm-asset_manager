/**
 * Buddy AI — Request context type
 *
 * Tool exposure is decided per request by the tool registry
 * (tools/registry.ts) using `roleHasPermission(role, module, action)`.
 */

import type { Role } from "@/lib/rbac";

export type BuddyAIContext = {
  userId: string;
  tenantId: string;
  tenantName?: string;
  role: Role;
};
