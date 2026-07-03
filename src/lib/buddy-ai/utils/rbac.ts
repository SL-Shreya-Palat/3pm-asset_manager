/**
 * Buddy AI — Tool permission mapping and RBAC
 *
 * Single registry: add tools here and they flow to the agent (when user has permission).
 * Phase 1: projects + resources only. Add one module at a time.
 */

import { Permissions } from "@/consts/getPermissions";
import type { PermissionChecker, RolePermissions } from "@/lib/permission-helpers";

/** Tools grouped by module — add one module at a time */
const TOOLS_BY_MODULE = {
  // No permission required (reads navigation map only)
  _global: {
    get_feature_guide: "",
  },
  projects: {
    list_projects: Permissions.projects.view,
    get_project_details: Permissions.projects.view,
    create_project: Permissions.projects.project.form.create,
  },
  resources: {
    get_staff_directory: Permissions.resources.staff.view,
    list_leave_requests: Permissions.resources.leave.view,
  },
  businessContacts: {
    list_business_contacts: Permissions.businessContacts.view,
    create_business_contact: Permissions.businessContacts.businessContact.form.create,
    update_business_contact: Permissions.businessContacts.businessContact.form.edit,
  },
  assets: {
    list_assets: Permissions.assets.asset.view,
  },
  tasks: {
    list_tasks_by_project: Permissions.projects.view,
  },
  sales: {
    list_leads: Permissions.sales.leads.view,
    list_quotes: Permissions.sales.quotes.view,
    list_invoices: Permissions.sales.invoices.view,
    list_claims: Permissions.sales.claims.view,
  },
} as const;

/** Flattened map: tool name → required permission string */
export const TOOL_PERMISSION_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(TOOLS_BY_MODULE).flatMap(([, tools]) => Object.entries(tools))
);

/**
 * Pre-compute which tools the user can call. O(1) per tool at context creation.
 */
export function buildAllowedTools(permissionChecker: PermissionChecker): Set<string> {
  const allowed = new Set<string>();
  for (const [toolName, requiredPermission] of Object.entries(TOOL_PERMISSION_MAP)) {
    if (!requiredPermission || requiredPermission.trim() === "") {
      allowed.add(toolName);
    } else if (permissionChecker.hasPermission(requiredPermission)) {
      allowed.add(toolName);
    }
  }
  return allowed;
}

export type BuddyAIContext = {
  userId: string;
  tenantId: string;
  tenantName?: string;
  rolePermissions: RolePermissions;
  permissionChecker: PermissionChecker;
  allowedTools: Set<string>;
};

/**
 * O(1) check: can the user call this tool?
 */
export function canAccessTool(
  context: BuddyAIContext,
  toolName: string
): boolean {
  return context.allowedTools.has(toolName);
}
