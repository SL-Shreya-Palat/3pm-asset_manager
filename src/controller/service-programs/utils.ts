/**
 * Service Program validation utilities -- custom validators (no Zod).
 */
import { isNonEmptyString, isValidObjectId } from '@/lib/validation/commonValidators';
import {
  SERVICE_PROGRAM_CATEGORIES,
  SERVICE_TRIGGER_TYPES,
  INTERVAL_TYPES,
  TIME_UNITS,
} from './types';
import type { CreateServiceProgramInput } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Validate service program creation input. */
export function validateCreateServiceProgramInput(input: CreateServiceProgramInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(input.title)) {
    errors.title = 'Title is required';
  } else if (input.title.trim().length > 160) {
    errors.title = 'Title must be at most 160 characters';
  }

  if (input.description && input.description.trim().length > 2000) {
    errors.description = 'Description must be at most 2000 characters';
  }

  if (input.category) {
    if (!(SERVICE_PROGRAM_CATEGORIES as readonly string[]).includes(input.category)) {
      errors.category = `Invalid category. Must be one of: ${SERVICE_PROGRAM_CATEGORIES.join(', ')}`;
    }
  }

  if (input.serviceTaskIds && Array.isArray(input.serviceTaskIds)) {
    const invalid = input.serviceTaskIds.filter((id) => !isValidObjectId(id));
    if (invalid.length > 0) {
      errors.serviceTaskIds = 'One or more service task IDs are invalid';
    }
  }

  if (input.assetIds && Array.isArray(input.assetIds)) {
    const invalid = input.assetIds.filter((id) => !isValidObjectId(id));
    if (invalid.length > 0) {
      errors.assetIds = 'One or more asset IDs are invalid';
    }
  }

  if (input.triggers && Array.isArray(input.triggers)) {
    for (let i = 0; i < input.triggers.length; i++) {
      const t = input.triggers[i];
      if (!(SERVICE_TRIGGER_TYPES as readonly string[]).includes(t.triggerType)) {
        errors[`triggers[${i}].triggerType`] = `Invalid trigger type. Must be one of: ${SERVICE_TRIGGER_TYPES.join(', ')}`;
      }
      if (!(INTERVAL_TYPES as readonly string[]).includes(t.intervalType)) {
        errors[`triggers[${i}].intervalType`] = `Invalid interval type. Must be one of: ${INTERVAL_TYPES.join(', ')}`;
      }
      if (typeof t.interval !== 'number' || isNaN(t.interval) || t.interval <= 0) {
        errors[`triggers[${i}].interval`] = 'Interval must be a positive number';
      }
      if (t.triggerType === 'time' && t.timeUnit) {
        if (!(TIME_UNITS as readonly string[]).includes(t.timeUnit)) {
          errors[`triggers[${i}].timeUnit`] = `Invalid time unit. Must be one of: ${TIME_UNITS.join(', ')}`;
        }
      }
      if (t.reminderThreshold !== undefined && t.reminderThreshold !== null) {
        if (typeof t.reminderThreshold !== 'number' || isNaN(t.reminderThreshold) || t.reminderThreshold < 0) {
          errors[`triggers[${i}].reminderThreshold`] = 'Reminder threshold must be a non-negative number';
        }
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Serialize a service program document for API response. */
export function serializeServiceProgram(doc: Record<string, unknown>): Record<string, unknown> {
  const taskIds = doc.serviceTaskIds as Array<{ toString(): string }> | undefined;
  const assetIds = doc.assetIds as Array<{ toString(): string }> | undefined;
  const triggers = doc.triggers as Array<Record<string, unknown>> | undefined;

  return {
    id: doc._id?.toString(),
    title: doc.title,
    description: doc.description || undefined,
    category: doc.category || 'scheduled_maintenance',
    serviceTaskIds: taskIds ? taskIds.map((id) => id.toString()) : [],
    assetIds: assetIds ? assetIds.map((id) => id.toString()) : [],
    triggers: triggers
      ? triggers.map((t) => ({
          triggerType: t.triggerType,
          intervalType: t.intervalType,
          interval: t.interval,
          timeUnit: t.timeUnit || undefined,
          reminderThreshold: t.reminderThreshold ?? undefined,
        }))
      : [],
    isActive: doc.isActive ?? true,
    isArchived: doc.isArchived ?? false,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
  };
}
