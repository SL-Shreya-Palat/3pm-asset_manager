import type { SparsePermissions } from '@/lib/rbac';
import type { RoleType } from '@/controller/roles/types';

// ---------------------------------------------------------------------------
// Role row (API response shape used in the list/view pages)
// ---------------------------------------------------------------------------

export interface RoleRow {
  id: string;
  name: string;
  nameLower: string;
  description?: string;
  baseCostPerHour: number;
  chargeOutRate: number;
  permissions: SparsePermissions;
  isSystem: boolean;
  /** Whether this is a built-in system role (Owner/Admin) or a custom role. */
  type: RoleType;
  isActive: boolean;
  teamScoped: boolean;
  mobileOnly: boolean;
  isManager: boolean | null;
  isTeamManager: boolean | null;
  isMechanic: boolean | null;
  isDriver: boolean | null;
  isAdmin: boolean | null;
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// UI-specific permission types (used in role form)
// ---------------------------------------------------------------------------

export type PermissionLevel = 'all' | 'own' | 'none';

export interface PermissionForm {
  name: string;
  key: string;
  /** Which actions are available for this form (from forms.ts accessibility). */
  accessibility: string[];
  viewLevel: PermissionLevel;
  create: boolean;
  editLevel: PermissionLevel;
  archiveLevel: PermissionLevel;
  deleteLevel: PermissionLevel;
}

export interface PermissionSubModule {
  name: string;
  key: string;
  view: boolean;
  forms: PermissionForm[];
}

export interface PermissionModule {
  name: string;
  key: string;
  view: boolean;
  subModules: PermissionSubModule[];
}
