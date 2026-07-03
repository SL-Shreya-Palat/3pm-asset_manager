/**
 * Service Program validation utilities -- custom validators (no Zod).
 */
import { isNonEmptyString, isValidObjectId } from '@/lib/validation/commonValidators';
import {
  INTERVAL_TYPES,
  CALENDAR_UNITS,
  ENDS_TYPES,
  ONE_TIME_MODES,
  REMINDER_CHANNELS,
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

  // Validate interval
  if (input.interval) {
    const iv = input.interval;
    if (!(INTERVAL_TYPES as readonly string[]).includes(iv.type)) {
      errors['interval.type'] = `Invalid interval type. Must be one of: ${INTERVAL_TYPES.join(', ')}`;
    }

    if (iv.type === 'repeat') {
      if (iv.mileage?.enabled && (typeof iv.mileage.every !== 'number' || iv.mileage.every <= 0)) {
        errors['interval.mileage'] = 'Mileage value must be a positive number';
      }
      if (iv.engineHours?.enabled && (typeof iv.engineHours.every !== 'number' || iv.engineHours.every <= 0)) {
        errors['interval.engineHours'] = 'Engine hours value must be a positive number';
      }
      if (iv.calendar?.enabled) {
        if (typeof iv.calendar.every !== 'number' || iv.calendar.every <= 0) {
          errors['interval.calendar'] = 'Calendar interval value must be a positive number';
        }
        if (iv.calendar.unit && !(CALENDAR_UNITS as readonly string[]).includes(iv.calendar.unit)) {
          errors['interval.calendar.unit'] = `Invalid calendar unit. Must be one of: ${CALENDAR_UNITS.join(', ')}`;
        }
      }
      if (iv.ends) {
        if (!(ENDS_TYPES as readonly string[]).includes(iv.ends.type)) {
          errors['interval.ends.type'] = `Invalid ends type. Must be one of: ${ENDS_TYPES.join(', ')}`;
        }
        if (iv.ends.type === 'on' && iv.ends.date) {
          const d = new Date(iv.ends.date);
          if (isNaN(d.getTime())) errors['interval.ends.date'] = 'Invalid end date';
        }
        if (iv.ends.type === 'after' && iv.ends.occurrences !== undefined) {
          if (typeof iv.ends.occurrences !== 'number' || iv.ends.occurrences <= 0) {
            errors['interval.ends.occurrences'] = 'Occurrences must be a positive number';
          }
        }
        if (iv.ends.type === 'meter_reading' && iv.ends.meterReading !== undefined) {
          if (typeof iv.ends.meterReading !== 'number' || iv.ends.meterReading <= 0) {
            errors['interval.ends.meterReading'] = 'Meter reading must be a positive number';
          }
        }
      }
    }

    if (iv.type === 'one_time') {
      if (iv.dueMileage?.enabled && (typeof iv.dueMileage.value !== 'number' || iv.dueMileage.value <= 0)) {
        errors['interval.dueMileage'] = 'Mileage value must be a positive number';
      }
      if (iv.dueMileage?.mode && !(ONE_TIME_MODES as readonly string[]).includes(iv.dueMileage.mode)) {
        errors['interval.dueMileage.mode'] = `Invalid mode. Must be one of: ${ONE_TIME_MODES.join(', ')}`;
      }
      if (iv.dueEngineHours?.enabled && (typeof iv.dueEngineHours.value !== 'number' || iv.dueEngineHours.value <= 0)) {
        errors['interval.dueEngineHours'] = 'Engine hours value must be a positive number';
      }
      if (iv.dueEngineHours?.mode && !(ONE_TIME_MODES as readonly string[]).includes(iv.dueEngineHours.mode)) {
        errors['interval.dueEngineHours.mode'] = `Invalid mode. Must be one of: ${ONE_TIME_MODES.join(', ')}`;
      }
      if (iv.dueOnDate?.enabled && iv.dueOnDate.date) {
        const d = new Date(iv.dueOnDate.date);
        if (isNaN(d.getTime())) {
          errors['interval.dueOnDate'] = 'Invalid due date';
        }
      }
    }
  }

  // Validate reminders
  if (input.reminders) {
    const rm = input.reminders;
    if (rm.thresholdMileage?.enabled && (typeof rm.thresholdMileage.value !== 'number' || rm.thresholdMileage.value <= 0)) {
      errors['reminders.thresholdMileage'] = 'Mileage threshold must be a positive number';
    }
    if (rm.thresholdEngineHours?.enabled && (typeof rm.thresholdEngineHours.value !== 'number' || rm.thresholdEngineHours.value <= 0)) {
      errors['reminders.thresholdEngineHours'] = 'Engine hours threshold must be a positive number';
    }
    if (rm.thresholdCalendar?.enabled) {
      if (typeof rm.thresholdCalendar.value !== 'number' || rm.thresholdCalendar.value <= 0) {
        errors['reminders.thresholdCalendar'] = 'Calendar threshold must be a positive number';
      }
      if (rm.thresholdCalendar.unit && !(CALENDAR_UNITS as readonly string[]).includes(rm.thresholdCalendar.unit)) {
        errors['reminders.thresholdCalendar.unit'] = `Invalid unit. Must be one of: ${CALENDAR_UNITS.join(', ')}`;
      }
    }
    if (rm.mechanicId && !isValidObjectId(rm.mechanicId)) {
      errors['reminders.mechanicId'] = 'Invalid mechanic ID';
    }
    if (rm.channels && Array.isArray(rm.channels)) {
      const invalidChannels = rm.channels.filter((c) => !(REMINDER_CHANNELS as readonly string[]).includes(c));
      if (invalidChannels.length > 0) {
        errors['reminders.channels'] = `Invalid channels. Must be one of: ${REMINDER_CHANNELS.join(', ')}`;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Serialize a service program document for API response. */
export function serializeServiceProgram(doc: Record<string, unknown>): Record<string, unknown> {
  const taskIds = doc.serviceTaskIds as Array<{ toString(): string }> | undefined;
  const assetIds = doc.assetIds as Array<{ toString(): string }> | undefined;
  const interval = doc.interval as Record<string, unknown> | undefined;
  const reminders = doc.reminders as Record<string, unknown> | undefined;

  const serializeInterval = (iv: Record<string, unknown>) => {
    const result: Record<string, unknown> = { type: iv.type || 'repeat' };

    if (iv.mileage) result.mileage = iv.mileage;
    if (iv.engineHours) result.engineHours = iv.engineHours;
    if (iv.calendar) result.calendar = iv.calendar;

    if (iv.ends) {
      const ends = iv.ends as Record<string, unknown>;
      result.ends = {
        type: ends.type || 'never',
        date: ends.date
          ? (ends.date instanceof Date ? ends.date.toISOString() : ends.date)
          : undefined,
        occurrences: ends.occurrences ?? undefined,
        meterReading: ends.meterReading ?? undefined,
      };
    }

    if (iv.dueMileage) result.dueMileage = iv.dueMileage;
    if (iv.dueEngineHours) result.dueEngineHours = iv.dueEngineHours;
    if (iv.dueOnDate) {
      const dod = iv.dueOnDate as Record<string, unknown>;
      result.dueOnDate = {
        enabled: dod.enabled ?? false,
        date: dod.date
          ? (dod.date instanceof Date ? dod.date.toISOString() : dod.date)
          : undefined,
      };
    }

    return result;
  };

  return {
    id: doc._id?.toString(),
    title: doc.title,
    serviceTaskIds: taskIds ? taskIds.map((id) => id.toString()) : [],
    interval: interval ? serializeInterval(interval) : { type: 'repeat' },
    assetIds: assetIds ? assetIds.map((id) => id.toString()) : [],
    reminders: reminders
      ? {
          thresholdMileage: reminders.thresholdMileage ?? undefined,
          thresholdEngineHours: reminders.thresholdEngineHours ?? undefined,
          thresholdCalendar: reminders.thresholdCalendar ?? undefined,
          autoCreateWorkOrder: reminders.autoCreateWorkOrder ?? false,
          mechanicId: reminders.mechanicId ? (reminders.mechanicId as { toString(): string }).toString() : undefined,
          channels: reminders.channels || [],
          recipientSelf: reminders.recipientSelf ?? false,
        }
      : { autoCreateWorkOrder: false, channels: [], recipientSelf: false },
    isActive: doc.isActive ?? true,
    isArchived: doc.isArchived ?? false,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
  };
}
