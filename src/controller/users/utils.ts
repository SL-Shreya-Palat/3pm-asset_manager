/**
 * TenantMember validation utilities -- custom validators (no Zod).
 */
import { isNonEmptyString, isValidEmail, isValidPhone, isValidObjectId } from '@/lib/validation/commonValidators';
import type { InviteUserInput } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Validate invite user input. */
export function validateInviteUserInput(input: InviteUserInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(input.firstName)) {
    errors.firstName = 'First name is required';
  } else if (input.firstName.trim().length > 100) {
    errors.firstName = 'First name must be at most 100 characters';
  }

  if (!isNonEmptyString(input.lastName)) {
    errors.lastName = 'Last name is required';
  } else if (input.lastName.trim().length > 100) {
    errors.lastName = 'Last name must be at most 100 characters';
  }

  if (!isNonEmptyString(input.email)) {
    errors.email = 'Email is required';
  } else if (!isValidEmail(input.email)) {
    errors.email = 'Invalid email address';
  }

  if (!isNonEmptyString(input.roleId)) {
    errors.roleId = 'Role is required';
  } else if (!isValidObjectId(input.roleId)) {
    errors.roleId = 'Invalid role';
  }

  if (input.mobileNumber && !isValidPhone(input.mobileNumber)) {
    errors.mobileNumber = 'Invalid phone number';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Serialize a tenantMember document for API response. */
export function serializeTenantMember(
  doc: Record<string, unknown>,
  roleName?: string,
  extra?: { teamIds?: string[]; teamNames?: string[]; teamRole?: string },
): Record<string, unknown> {
  return {
    id: doc._id?.toString(),
    firstName: doc.firstName || '',
    lastName: doc.lastName || '',
    email: doc.email || '',
    mobileNumber: doc.mobileNumber || undefined,
    roleId: doc.roleId ? (doc.roleId as { toString(): string }).toString() : undefined,
    roleName: roleName || undefined,
    isActive: doc.isActive ?? true,
    portalUser: doc.portalUser ?? true,
    status: doc.status || 'active',
    teamIds: extra?.teamIds ?? [],
    teamNames: extra?.teamNames ?? [],
    teamRole: extra?.teamRole ?? undefined,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
  };
}
