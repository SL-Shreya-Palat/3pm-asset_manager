/**
 * Role domain types -- TypeScript interfaces for the roles collection.
 */
import { ObjectId } from 'mongodb';
import type { ModuleKey, Action } from '@/lib/rbac';

/** Module permission set stored in the database. */
export type ModulePermissions = Partial<Record<Action, boolean>>;

/** Permissions shape stored on each role document. */
export type StoredPermissions =
  | { scope: 'all'; teamScoped: false; mobileOnly: false }
  | {
      scope: 'modules';
      modules: Partial<Record<ModuleKey, ModulePermissions>>;
      teamScoped: boolean;
      mobileOnly: boolean;
    };

/** Stored role document. */
export interface RoleDocument {
  _id: ObjectId;
  tenantId: ObjectId;

  name: string;
  key: string;
  description?: string;
  permissions: StoredPermissions;
  isSystem: boolean;

  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  isArchived: boolean;
  archivedAt?: Date | null;
  archivedBy?: ObjectId | null;
}

/** Input for creating a role. */
export interface CreateRoleInput {
  name: string;
  description?: string;
  permissions: StoredPermissions;
}

/** Input for updating a role. */
export type UpdateRoleInput = Partial<CreateRoleInput>;

/** Serialized role for API responses. */
export interface RoleResponse {
  id: string;
  name: string;
  key: string;
  description?: string;
  permissions: StoredPermissions;
  isSystem: boolean;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
