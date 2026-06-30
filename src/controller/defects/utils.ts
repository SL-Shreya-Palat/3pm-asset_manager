/**
 * Defect validation & serialization utilities.
 */
import { isNonEmptyString, isValidObjectId, isEnumMember } from '@/lib/validation/commonValidators';
import { getCountersCollection } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import {
  DEFECT_STATUSES,
  DEFECT_PRIORITIES,
  DEFECT_SEVERITIES,
  type CreateDefectInput,
} from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Validate create-defect input. */
export function validateCreateDefectInput(input: CreateDefectInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(input.name)) {
    errors.name = 'Defect name is required';
  } else if (input.name.trim().length > 200) {
    errors.name = 'Defect name must be at most 200 characters';
  }

  if (!isNonEmptyString(input.date)) {
    errors.date = 'Date is required';
  } else if (isNaN(Date.parse(input.date))) {
    errors.date = 'Date must be a valid date';
  }

  if (!isNonEmptyString(input.comment)) {
    errors.comment = 'Comment is required';
  } else if (input.comment.trim().length > 2000) {
    errors.comment = 'Comment must be at most 2000 characters';
  }

  if (!isValidObjectId(input.assetId)) {
    errors.assetId = 'Asset is required';
  }

  if (input.driverId && !isValidObjectId(input.driverId)) {
    errors.driverId = 'Invalid driver ID';
  }

  if (!isEnumMember(input.priority, DEFECT_PRIORITIES)) {
    errors.priority = `Priority must be one of: ${DEFECT_PRIORITIES.join(', ')}`;
  }

  if (!isEnumMember(input.severity, DEFECT_SEVERITIES)) {
    errors.severity = `Severity must be one of: ${DEFECT_SEVERITIES.join(', ')}`;
  }

  if (input.status && !isEnumMember(input.status, DEFECT_STATUSES)) {
    errors.status = `Status must be one of: ${DEFECT_STATUSES.join(', ')}`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Serialize a defect document for API response. */
export function serializeDefect(
  doc: Record<string, unknown>,
  extra?: { teamNames?: string[] },
): Record<string, unknown> {
  const teamIds = Array.isArray(doc.teamIds)
    ? (doc.teamIds as ObjectId[]).map((id) => id.toString())
    : [];

  return {
    id: doc._id?.toString(),
    defectNumber: doc.defectNumber,
    name: doc.name,
    date: doc.date ? (doc.date as Date).toISOString() : null,
    comment: doc.comment,
    assetId: doc.assetId?.toString(),
    assetName: doc.assetName || '',
    driverId: doc.driverId ? (doc.driverId as ObjectId).toString() : null,
    driverName: doc.driverName || null,
    priority: doc.priority,
    severity: doc.severity,
    status: doc.status,
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

/**
 * Reserve `count` sequential defect numbers in a single atomic increment.
 * Returns them in order (e.g. ['DF-0007', 'DF-0008']). Used when one inspection
 * yields several defects, so we hit the counter once instead of N times.
 */
export async function reserveDefectNumbers(tenantId: string, count: number): Promise<string[]> {
  if (count <= 0) return [];
  const counters = await getCountersCollection();
  const result = await counters.findOneAndUpdate(
    { _id: `defect_${tenantId}` as unknown as ObjectId },
    { $inc: { seq: count } },
    { upsert: true, returnDocument: 'after' },
  );
  const end = (result?.seq as number) || count; // last seq after the increment
  const start = end - count + 1;
  const numbers: string[] = [];
  for (let seq = start; seq <= end; seq++) {
    numbers.push(`DF-${String(seq).padStart(4, '0')}`);
  }
  return numbers;
}

/** Generate the next defect number (DF-0001) using the atomic counter. */
export async function generateDefectNumber(tenantId: string): Promise<string> {
  const [number] = await reserveDefectNumbers(tenantId, 1);
  return number;
}
