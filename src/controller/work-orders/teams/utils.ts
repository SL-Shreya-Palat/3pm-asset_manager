/**
 * Team validation utilities -- custom validators (no Zod).
 */
import { isNonEmptyString } from '@/lib/validation/commonValidators';
import type { CreateTeamInput } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Validate team creation input. */
export function validateCreateTeamInput(input: CreateTeamInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(input.name)) {
    errors.name = 'Team name is required';
  } else if (input.name.trim().length > 100) {
    errors.name = 'Team name must be at most 100 characters';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Serialize a team document for API response. */
export function serializeTeam(
  doc: Record<string, unknown>,
  counts?: { assetCount?: number; driverCount?: number },
): Record<string, unknown> {
  const assetIds = Array.isArray(doc.assetIds)
    ? doc.assetIds.map((id: { toString(): string }) => id.toString())
    : [];

  return {
    id: doc._id?.toString(),
    name: doc.name,
    assetIds,
    assetCount: counts?.assetCount ?? assetIds.length,
    driverCount: counts?.driverCount ?? 0,
    isActive: doc.isActive ?? true,
    isArchived: doc.isArchived ?? false,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
    createdBy: doc.createdBy ? (doc.createdBy as { toString(): string }).toString() : null,
  };
}
