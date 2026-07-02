/**
 * Fault validation & serialization utilities.
 */
import { isNonEmptyString, isValidObjectId, isEnumMember } from '@/lib/validation/commonValidators';
import { getCountersCollection } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import {
  FAULT_STATUSES,
  FAULT_PRIORITIES,
  FAULT_CATEGORIES,
  REPORTED_BY_TYPES,
  type CreateFaultInput,
} from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Validate create-fault input. */
export function validateCreateFaultInput(input: CreateFaultInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(input.title)) {
    errors.title = 'Fault title is required';
  } else if (input.title.trim().length > 200) {
    errors.title = 'Fault title must be at most 200 characters';
  }

  if (!isNonEmptyString(input.description)) {
    errors.description = 'Description is required';
  } else if (input.description.trim().length > 2000) {
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

  if (!isEnumMember(input.category, FAULT_CATEGORIES)) {
    errors.category = `Category must be one of: ${FAULT_CATEGORIES.join(', ')}`;
  }

  if (!isEnumMember(input.priority, FAULT_PRIORITIES)) {
    errors.priority = `Priority must be one of: ${FAULT_PRIORITIES.join(', ')}`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Serialize a fault document for API response. */
export function serializeFault(
  doc: Record<string, unknown>,
  extra?: { assetName?: string; reportedByName?: string; teamNames?: string[] },
): Record<string, unknown> {
  const teamIds = Array.isArray(doc.teamIds)
    ? (doc.teamIds as ObjectId[]).map((id) => id.toString())
    : [];

  return {
    id: doc._id?.toString(),
    faultNumber: doc.faultNumber,
    title: doc.title,
    description: doc.description,
    reportedAt: doc.reportedAt ? (doc.reportedAt as Date).toISOString() : null,
    assetId: doc.assetId?.toString(),
    assetName: extra?.assetName ?? '',
    reportedByType: doc.reportedByType,
    reportedById: doc.reportedById ? (doc.reportedById as ObjectId).toString() : null,
    reportedByName: extra?.reportedByName ?? '',
    category: doc.category,
    priority: doc.priority,
    severity: doc.severity,
    status: doc.status,
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

/** Generate the next fault number (FLT-0001) using the atomic counter. */
export async function generateFaultNumber(tenantId: string): Promise<string> {
  const counters = await getCountersCollection();
  const result = await counters.findOneAndUpdate(
    { _id: `fault_${tenantId}` as unknown as ObjectId },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  const seq = (result?.seq as number) || 1;
  return `FLT-${String(seq).padStart(4, '0')}`;
}
