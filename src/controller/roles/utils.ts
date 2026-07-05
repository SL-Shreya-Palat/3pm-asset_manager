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
  } else if (input.permissions.v !== 2) {
    errors.permissions = 'Invalid permission format version';
  } else if (!Array.isArray(input.permissions.forms)) {
    errors.permissions = 'Permissions forms must be an array';
  } else if (!Array.isArray(input.permissions.m)) {
    errors.permissions = 'Permissions modules must be an array';
  }

  if (input.baseCostPerHour !== undefined && input.baseCostPerHour !== null) {
    if (typeof input.baseCostPerHour !== 'number' || input.baseCostPerHour < 0) {
      errors.baseCostPerHour = 'Base cost per hour must be a non-negative number';
    }
  }

  if (input.chargeOutRate !== undefined && input.chargeOutRate !== null) {
    if (typeof input.chargeOutRate !== 'number' || input.chargeOutRate < 0) {
      errors.chargeOutRate = 'Charge out rate must be a non-negative number';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Serialize a role document for API response. */
export function serializeRole(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    id: doc._id?.toString(),
    name: doc.name,
    nameLower: doc.nameLower,
    description: doc.description || undefined,
    baseCostPerHour: doc.baseCostPerHour ?? 0,
    chargeOutRate: doc.chargeOutRate ?? 0,
    permissions: doc.permissions,
    isSystem: doc.isSystem ?? false,
    isActive: doc.isActive ?? true,
    teamScoped: doc.teamScoped ?? false,
    mobileOnly: doc.mobileOnly ?? false,
    isManager: doc.isManager ?? null,
    isTeamManager: doc.isTeamManager ?? null,
    isMechanic: doc.isMechanic ?? null,
    isDriver: doc.isDriver ?? null,
    isAdmin: doc.isAdmin ?? null,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
  };
}
