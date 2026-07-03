/**
 * Fault validation & serialization utilities.
 *
 * Faults are now stored in the defects collection with source='fault'.
 * This module maps between the fault API format and the defect document format.
 */
import { isNonEmptyString, isValidObjectId, isEnumMember } from '@/lib/validation/commonValidators';
import { ObjectId } from 'mongodb';
import {
  FAULT_PRIORITIES,
  FAULT_CATEGORIES,
  REPORTED_BY_TYPES,
  type CreateFaultInput,
} from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

// ─── Status mapping ──────────────────────────────────────────────────────────

/** Map fault status → defect status (for writes). */
export const FAULT_TO_DEFECT_STATUS: Record<string, string> = {
  open: 'new',
  in_progress: 'in_progress',
  resolved: 'corrected',
  wont_fix: 'no_correction_needed',
};

/** Map defect status → fault status (for reads). */
export const DEFECT_TO_FAULT_STATUS: Record<string, string> = {
  new: 'open',
  in_progress: 'in_progress',
  corrected: 'resolved',
  no_correction_needed: 'wont_fix',
};

// ─── Validation ──────────────────────────────────────────────────────────────

/** Validate create-fault input. */
export function validateCreateFaultInput(input: CreateFaultInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(input.title)) {
    errors.title = 'Fault title is required';
  } else if (input.title.trim().length > 200) {
    errors.title = 'Fault title must be at most 200 characters';
  }

  if (input.description && input.description.trim().length > 2000) {
    errors.description = 'Description must be at most 2000 characters';
  }

  if (!isNonEmptyString(input.reportedAt)) {
    errors.reportedAt = 'Reported date is required';
  } else if (isNaN(Date.parse(input.reportedAt))) {
    errors.reportedAt = 'Reported date must be a valid date';
  }

  if (!isValidObjectId(input.assetId)) {
    errors.assetId = 'Asset is required';
  }

  if (!isEnumMember(input.reportedByType, REPORTED_BY_TYPES)) {
    errors.reportedByType = `Reporter type must be one of: ${REPORTED_BY_TYPES.join(', ')}`;
  }

  if (!isValidObjectId(input.reportedById)) {
    errors.reportedById = 'Reporter is required';
  }

  if (input.category && !isEnumMember(input.category, FAULT_CATEGORIES)) {
    errors.category = `Category must be one of: ${FAULT_CATEGORIES.join(', ')}`;
  }

  if (input.priority && !isEnumMember(input.priority, FAULT_PRIORITIES)) {
    errors.priority = `Priority must be one of: ${FAULT_PRIORITIES.join(', ')}`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// ─── Serialization ───────────────────────────────────────────────────────────

/**
 * Serialize a defect document (source='fault') into the fault API response
 * format expected by the faults page.
 *
 * Field mapping: defectNumber→faultNumber, name→title, comment→description,
 * date→reportedAt, status mapped via DEFECT_TO_FAULT_STATUS.
 */
export function serializeFault(
  doc: Record<string, unknown>,
  extra?: { assetName?: string; reportedByName?: string; teamNames?: string[] },
): Record<string, unknown> {
  const teamIds = Array.isArray(doc.teamIds)
    ? (doc.teamIds as ObjectId[]).map((id) => id.toString())
    : [];

  const rawStatus = String(doc.status || 'new');

  return {
    id: doc._id?.toString(),
    faultNumber: doc.defectNumber,
    title: doc.name,
    description: doc.comment,
    reportedAt: doc.date ? (doc.date as Date).toISOString() : null,
    assetId: doc.assetId?.toString(),
    assetName: extra?.assetName ?? (doc.assetName as string) ?? '',
    reportedByType: doc.reportedByType ?? 'member',
    reportedById: doc.reportedById ? (doc.reportedById as ObjectId).toString() : null,
    reportedByName: extra?.reportedByName ?? '',
    category: doc.category ?? 'other',
    priority: doc.priority,
    severity: doc.severity,
    status: DEFECT_TO_FAULT_STATUS[rawStatus] || rawStatus,
    meterType: doc.meterType ?? null,
    meterReading: doc.meterReading ?? null,
    takeOutOfService: doc.takeOutOfService ?? false,
    workOrderId: doc.workOrderId ? (doc.workOrderId as ObjectId).toString() : null,
    workOrderNumber: doc.workOrderNumber || null,
    teamIds,
    teamNames: extra?.teamNames ?? [],
    attachments: Array.isArray(doc.attachments)
      ? (doc.attachments as Array<Record<string, unknown>>).map((a) => ({
          url: a.url,
          filename: a.filename,
          originalName: a.originalName,
          contentType: a.contentType,
          size: a.size,
          uploadedAt: a.uploadedAt ? (a.uploadedAt as Date).toISOString() : null,
        }))
      : [],
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
    isArchived: doc.isArchived ?? false,
  };
}
