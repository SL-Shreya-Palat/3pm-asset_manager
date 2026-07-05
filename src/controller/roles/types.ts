/**
 * Role domain types -- TypeScript interfaces for the roles collection.
 */
import { ObjectId } from 'mongodb';
import type { SparsePermissions } from '@/lib/rbac';

/** Permissions shape stored on each role document. */
export type StoredPermissions = SparsePermissions;

/** Stored role document. */
export interface RoleDocument {
  _id: ObjectId;
  tenantId: ObjectId;

  name: string;
  nameLower: string;
  description?: string;
  baseCostPerHour: number;
  chargeOutRate: number;
  permissions: StoredPermissions;
  isSystem: boolean;

  /** Data filtered by managed teams when true. */
  teamScoped: boolean;
  /** Restricted to mobile app only when true. */
  mobileOnly: boolean;

  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  isManager: boolean | null;
  isTeamManager: boolean | null;
  isMechanic: boolean | null;
  isDriver: boolean | null;
  isAdmin: boolean | null;
}

/** Input for creating a role. */
export interface CreateRoleInput {
  name: string;
  description?: string;
  baseCostPerHour?: number;
  chargeOutRate?: number;
  permissions: StoredPermissions;
  teamScoped?: boolean;
  mobileOnly?: boolean;
  isManager?: boolean | null;
  isTeamManager?: boolean | null;
  isMechanic?: boolean | null;
  isDriver?: boolean | null;
  isAdmin?: boolean | null;
}

/** Input for updating a role. */
export type UpdateRoleInput = Partial<CreateRoleInput>;

/** Serialized role for API responses. */
export interface RoleResponse {
  id: string;
  name: string;
  nameLower: string;
  description?: string;
  baseCostPerHour: number;
  chargeOutRate: number;
  permissions: StoredPermissions;
  isSystem: boolean;
  isActive: boolean;
  teamScoped: boolean;
  mobileOnly: boolean;
  isManager: boolean | null;
  isTeamManager: boolean | null;
  isMechanic: boolean | null;
  isDriver: boolean | null;
  isAdmin: boolean | null;
  createdAt: string;
  updatedAt: string;
}
