/**
 * Role validation utilities -- custom validators (no Zod).
 */
import { isNonEmptyString } from '@/lib/validation/commonValidators';
import type { CreateRoleInput } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Validate role creation input. */
export function validateCreateRoleInput(input: CreateRoleInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(input.name)) {
    errors.name = 'Role name is required';
  } else if (input.name.trim().length > 100) {
    errors.name = 'Role name must be at most 100 characters';
  }

  if (!input.permissions) {
    errors.permissions = 'Permissions are required';
  } else if (input.permissions.scope !== 'all' && input.permissions.scope !== 'modules') {
    errors.permissions = 'Invalid permission scope';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Generate a URL-safe key from the role name. */
export function generateRoleKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Serialize a role document for API response. */
export function serializeRole(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    id: doc._id?.toString(),
    name: doc.name,
    key: doc.key,
    description: doc.description || undefined,
    permissions: doc.permissions,
    isSystem: doc.isSystem ?? false,
    isActive: doc.isActive ?? true,
    isArchived: doc.isArchived ?? false,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
  };
}
