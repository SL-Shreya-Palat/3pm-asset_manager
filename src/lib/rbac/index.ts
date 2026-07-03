/**
 * RBAC chokepoint — single place that decides "can this role do X on module Y?"
 *
 * Called before every handler body:
 * ```ts
 * if (!roleHasPermission(role, 'assets', 'create')) return fail(403, 'Forbidden');
 * ```
 */

// ---------------------------------------------------------------------------
// Types (mirrors §C.2 of 02-BACKEND-ARCHITECTURE.md)
// ---------------------------------------------------------------------------

export type ModuleKey =
  | 'teams'
  | 'assets'
  | 'inspections'
  | 'forms'
  | 'exception_report'
  | 'defects'
  | 'faults'
  | 'service_tasks'
  | 'service_programs'
  | 'work_order'
  | 'inventory'
  | 'drivers'
  | 'fuel';

export type Action =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'bulkUpload';

export type ActionSet = Record<Action, boolean>;

export type RolePermissions =
  | { scope: 'all'; teamScoped: false; mobileOnly: false }
  | {
      scope: 'modules';
      modules: Partial<Record<ModuleKey, Partial<ActionSet>>>;
      teamScoped: boolean;
      mobileOnly: boolean;
    };

export interface Role {
  _id: string;
  key: string;
  name: string;
  permissions: RolePermissions;
  isSystem: boolean;
}

// ---------------------------------------------------------------------------
// Core permission check
// ---------------------------------------------------------------------------

/** Returns `true` when the role allows `action` on `module`. */
export function roleHasPermission(
  role: Role,
  module: ModuleKey,
  action: Action,
): boolean {
  const { permissions } = role;

  // Wildcard — admin/owner
  if (permissions.scope === 'all') return true;

  return permissions.modules[module]?.[action] === true;
}

/** Returns `true` when the role is team-scoped (data filtered by managed teams). */
export function isTeamScoped(role: Role): boolean {
  if (role.permissions.scope === 'all') return false;
  return role.permissions.teamScoped;
}

/** Returns `true` when the role is restricted to mobile-only access. */
export function isMobileOnly(role: Role): boolean {
  if (role.permissions.scope === 'all') return false;
  return role.permissions.mobileOnly;
}
