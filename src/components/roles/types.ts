import type { ModuleKey, Action } from '@/lib/rbac';

/** Module permission set for the frontend. */
export type ModulePermissions = Partial<Record<Action, boolean>>;

/** Permissions shape used in the form and API. */
export type RolePermissions =
  | { scope: 'all'; teamScoped: false; mobileOnly: false }
  | {
      scope: 'modules';
      modules: Partial<Record<ModuleKey, ModulePermissions>>;
      teamScoped: boolean;
      mobileOnly: boolean;
    };

export interface RoleRow {
  id: string;
  name: string;
  key: string;
  description?: string;
  permissions: RolePermissions;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

/** Permission tab grouping modules into UI categories. */
export interface PermissionTab {
  key: string;
  label: string;
  modules: { key: ModuleKey; label: string }[];
}

/** Default role template key. */
export type RoleTemplateKey = 'owner' | 'admin' | 'manager' | 'team_manager' | 'mechanic' | 'driver';
