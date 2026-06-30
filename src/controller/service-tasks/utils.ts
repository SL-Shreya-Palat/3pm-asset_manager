/**
 * Service Task validation utilities -- custom validators (no Zod).
 */
import { isNonEmptyString } from '@/lib/validation/commonValidators';
import type { CreateServiceTaskInput } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Validate service task creation input. */
export function validateCreateServiceTaskInput(input: CreateServiceTaskInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(input.title)) {
    errors.title = 'Title is required';
  } else if (input.title.trim().length > 160) {
    errors.title = 'Title must be at most 160 characters';
  }

  if (input.description && input.description.trim().length > 2000) {
    errors.description = 'Description must be at most 2000 characters';
  }

  if (input.laborCost !== undefined && input.laborCost !== null) {
    if (typeof input.laborCost !== 'number' || isNaN(input.laborCost) || input.laborCost < 0) {
      errors.laborCost = 'Labor cost must be a non-negative number';
    }
  }

  if (input.partsCost !== undefined && input.partsCost !== null) {
    if (typeof input.partsCost !== 'number' || isNaN(input.partsCost) || input.partsCost < 0) {
      errors.partsCost = 'Parts cost must be a non-negative number';
    }
  }

  if (input.totalCost !== undefined && input.totalCost !== null) {
    if (typeof input.totalCost !== 'number' || isNaN(input.totalCost) || input.totalCost < 0) {
      errors.totalCost = 'Total cost must be a non-negative number';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Serialize a service task document for API response. */
export function serializeServiceTask(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    id: doc._id?.toString(),
    title: doc.title,
    description: doc.description || undefined,
    laborCost: doc.laborCost ?? undefined,
    partsCost: doc.partsCost ?? undefined,
    totalCost: doc.totalCost ?? undefined,
    isActive: doc.isActive ?? true,
    isArchived: doc.isArchived ?? false,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
  };
}
