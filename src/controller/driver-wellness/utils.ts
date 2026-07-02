/**
 * Driver Wellness validation & serialization utilities.
 */
import type { CreateWellnessCheckInput } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Compute result from the four boolean wellness responses. */
export function computeWellnessResult(input: {
  fitToWork: boolean;
  freeOfFatigue: boolean;
  freeOfSubstances: boolean;
  noImpairingCondition: boolean;
}): 'pass' | 'fail' {
  return input.fitToWork && input.freeOfFatigue && input.freeOfSubstances && input.noImpairingCondition
    ? 'pass'
    : 'fail';
}

/** Validate wellness check creation input. */
export function validateCreateWellnessCheckInput(input: CreateWellnessCheckInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.driverId || typeof input.driverId !== 'string' || input.driverId.trim().length === 0) {
    errors.driverId = 'Driver is required';
  }

  if (typeof input.fitToWork !== 'boolean') {
    errors.fitToWork = 'Fit to work response is required';
  }
  if (typeof input.freeOfFatigue !== 'boolean') {
    errors.freeOfFatigue = 'Free of fatigue response is required';
  }
  if (typeof input.freeOfSubstances !== 'boolean') {
    errors.freeOfSubstances = 'Free of substances response is required';
  }
  if (typeof input.noImpairingCondition !== 'boolean') {
    errors.noImpairingCondition = 'No impairing condition response is required';
  }

  if (input.hoursOfSleep != null) {
    if (typeof input.hoursOfSleep !== 'number' || isNaN(input.hoursOfSleep) || input.hoursOfSleep < 0 || input.hoursOfSleep > 24) {
      errors.hoursOfSleep = 'Hours of sleep must be between 0 and 24';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Serialize a wellness check document for API response. */
export function serializeWellnessCheck(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    id: doc._id?.toString(),
    driverId: doc.driverId ? (doc.driverId as { toString(): string }).toString() : undefined,
    driverName: doc.driverName,
    fitToWork: doc.fitToWork,
    freeOfFatigue: doc.freeOfFatigue,
    freeOfSubstances: doc.freeOfSubstances,
    noImpairingCondition: doc.noImpairingCondition,
    hoursOfSleep: doc.hoursOfSleep ?? null,
    comments: doc.comments ?? null,
    signatureUrl: doc.signatureUrl ?? null,
    result: doc.result,
    submittedAt: doc.submittedAt ? (doc.submittedAt as Date).toISOString() : null,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
  };
}
