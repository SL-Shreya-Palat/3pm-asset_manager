/**
 * Driver validation utilities -- custom validators (no Zod).
 */
import { isNonEmptyString, isValidEmail, isValidPhone } from '@/lib/validation/commonValidators';
import type { CreateDriverInput } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Validate driver creation input. */
export function validateCreateDriverInput(input: CreateDriverInput): ValidationResult {
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

  if (input.email && !isValidEmail(input.email)) {
    errors.email = 'Invalid email address';
  }

  if (input.mobileNumber && !isValidPhone(input.mobileNumber)) {
    errors.mobileNumber = 'Invalid phone number';
  }

  if (input.homePhone && !isValidPhone(input.homePhone)) {
    errors.homePhone = 'Invalid phone number';
  }

  if (input.workPhone && !isValidPhone(input.workPhone)) {
    errors.workPhone = 'Invalid phone number';
  }

  if (input.ratePerUnit !== undefined && input.ratePerUnit !== null) {
    if (typeof input.ratePerUnit !== 'number' || isNaN(input.ratePerUnit) || input.ratePerUnit < 0) {
      errors.ratePerUnit = 'Rate must be a non-negative number';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Serialize a driver document for API response. */
export function serializeDriver(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    id: doc._id?.toString(),
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email || undefined,
    photoUrl: doc.photoUrl || undefined,
    notes: doc.notes || undefined,
    teamId: doc.teamId ? (doc.teamId as { toString(): string }).toString() : undefined,
    countryCode: doc.countryCode || undefined,
    mobileNumber: doc.mobileNumber || undefined,
    homePhone: doc.homePhone || undefined,
    workPhone: doc.workPhone || undefined,
    dateOfBirth: doc.dateOfBirth ? (doc.dateOfBirth as Date).toISOString() : null,

    employeeNumber: doc.employeeNumber || undefined,
    jobPosition: doc.jobPosition || undefined,
    rateCurrency: doc.rateCurrency || undefined,
    ratePerUnit: doc.ratePerUnit ?? undefined,
    otherNotes: doc.otherNotes || undefined,

    driverLicense: doc.driverLicense || undefined,
    licenseClass: doc.licenseClass || undefined,
    licenseNumber: doc.licenseNumber || undefined,
    healthCertificate: doc.healthCertificate || undefined,

    tenantMemberId: doc.tenantMemberId
      ? (doc.tenantMemberId as { toString(): string }).toString()
      : undefined,

    fitnessStatus: (doc.fitnessStatus as 'fit' | 'unfit' | null) ?? null,
    fitnessFlag: doc.fitnessFlag
      ? (() => {
          const f = doc.fitnessFlag as Record<string, unknown>;
          return {
            severity: (f.severity as 'low' | 'medium' | 'high') ?? 'low',
            reasons: Array.isArray(f.reasons) ? (f.reasons as string[]) : [],
            date: f.date ? (f.date as Date).toISOString() : null,
            inspectionSubmissionId: f.inspectionSubmissionId
              ? (f.inspectionSubmissionId as { toString(): string }).toString()
              : null,
          };
        })()
      : null,

    isActive: doc.isActive ?? true,
    isArchived: doc.isArchived ?? false,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
    // Command linkage — 'command'-sourced drivers badge as read-only master data.
    source: doc.source || 'local',
    commandSyncedAt: doc.commandSyncedAt ? (doc.commandSyncedAt as Date).toISOString() : null,
    createdBy: doc.createdBy ? (doc.createdBy as { toString(): string }).toString() : null,
  };
}
