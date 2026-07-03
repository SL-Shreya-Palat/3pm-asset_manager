/**
 * Document validation + serialization utilities — custom validators (no Zod).
 * Status ("valid / expiring_soon / expired / no_expiry") is computed here from
 * the expiry date, never stored, so it is always current.
 */
import { isNonEmptyString, isValidObjectId, isEnumMember } from '@/lib/validation/commonValidators';
import {
  DOCUMENT_SCOPES,
  DEFAULT_REMINDER_DAYS,
  DOCUMENT_TYPE_LABELS,
  documentTypesForScope,
  type DocumentScope,
  type DocumentStatus,
} from '@/constants/documents';
import type { CreateDocumentInput, DocumentResponse } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

const MS_PER_DAY = 86_400_000;

/** UTC start-of-day for a Date (dates are stored UTC-midnight — see date convention). */
function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole days from today until `expiry` (negative = already past). */
export function daysUntil(expiry: Date, now: Date = new Date()): number {
  return Math.round((startOfUtcDay(expiry) - startOfUtcDay(now)) / MS_PER_DAY);
}

/** Derived compliance status. `expiring_soon` window = `reminderDays`. */
export function computeDocumentStatus(
  expiryDate: Date | null | undefined,
  reminderDays: number,
  now: Date = new Date(),
): DocumentStatus {
  if (!expiryDate) return 'no_expiry';
  const days = daysUntil(expiryDate, now);
  if (days < 0) return 'expired';
  if (days <= (Number.isFinite(reminderDays) ? reminderDays : DEFAULT_REMINDER_DAYS)) return 'expiring_soon';
  return 'valid';
}

/** Validate document creation input. */
export function validateCreateDocumentInput(input: CreateDocumentInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!isEnumMember(input.scope, DOCUMENT_SCOPES)) {
    errors.scope = `Scope must be one of: ${DOCUMENT_SCOPES.join(', ')}`;
  } else {
    const scope = input.scope as DocumentScope;
    // scope → owner-id presence
    if (scope === 'asset' && !isValidObjectId(input.assetId)) errors.assetId = 'Valid asset is required';
    if (scope === 'driver' && !isValidObjectId(input.driverId)) errors.driverId = 'Valid driver is required';
    if (scope === 'team' && !isValidObjectId(input.teamId)) errors.teamId = 'Valid team is required';

    // docType must belong to the scope's allowed set
    if (!isNonEmptyString(input.docType)) {
      errors.docType = 'Document type is required';
    } else if (!(documentTypesForScope(scope) as readonly string[]).includes(input.docType)) {
      errors.docType = 'Invalid document type for this scope';
    }
  }

  if (input.title != null && typeof input.title === 'string' && input.title.trim().length > 160) {
    errors.title = 'Title must be at most 160 characters';
  }
  if (input.notes != null && typeof input.notes === 'string' && input.notes.trim().length > 2000) {
    errors.notes = 'Notes must be at most 2000 characters';
  }

  const expiry = input.expiryDate ? new Date(input.expiryDate) : null;
  if (input.expiryDate && expiry && isNaN(expiry.getTime())) errors.expiryDate = 'Invalid expiry date';

  if (input.reminderDays != null) {
    const r = Number(input.reminderDays);
    if (!Number.isInteger(r) || r < 0 || r > 365) {
      errors.reminderDays = 'Reminder lead time must be a whole number of days (0–365)';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Serialize a document for API response, computing derived status + days-to-expiry. */
export function serializeDocument(doc: Record<string, unknown>, now: Date = new Date()): DocumentResponse {
  const expiryDate = (doc.expiryDate as Date | null) ?? null;
  const reminderDays =
    typeof doc.reminderDays === 'number' ? (doc.reminderDays as number) : DEFAULT_REMINDER_DAYS;

  return {
    id: (doc._id as { toString(): string }).toString(),
    scope: doc.scope as DocumentScope,
    assetId: doc.assetId ? (doc.assetId as { toString(): string }).toString() : undefined,
    driverId: doc.driverId ? (doc.driverId as { toString(): string }).toString() : undefined,
    teamId: doc.teamId ? (doc.teamId as { toString(): string }).toString() : undefined,
    docType: (doc.docType as string) || 'other',
    title: (doc.title as string) || DOCUMENT_TYPE_LABELS[doc.docType as string] || 'Document',
    fileUrl: (doc.fileUrl as string) || undefined,
    fileName: (doc.fileName as string) || undefined,
    expiryDate: expiryDate ? expiryDate.toISOString() : null,
    reminderDays,
    notes: (doc.notes as string) || undefined,
    status: computeDocumentStatus(expiryDate, reminderDays, now),
    daysUntilExpiry: expiryDate ? daysUntil(expiryDate, now) : null,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
  };
}
