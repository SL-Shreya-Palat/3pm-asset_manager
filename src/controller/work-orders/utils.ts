import { ObjectId } from 'mongodb';
import { getCountersCollection } from '@/lib/mongodb';
import type { WorkOrder, AssigneeType } from './types';
import { ASSIGNEE_TYPES } from './types';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidObjectId(value: string): boolean {
  try {
    ObjectId.createFromHexString(value);
    return true;
  } catch {
    return false;
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateCreateWOInput(input: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};

  // Asset
  if (!input.assetId || typeof input.assetId !== 'string' || !isValidObjectId(input.assetId)) {
    errors.assetId = 'Valid asset is required';
  }

  // Service Tasks
  if (!Array.isArray(input.serviceTaskIds) || input.serviceTaskIds.length === 0) {
    errors.serviceTaskIds = 'At least one service task is required';
  } else {
    for (let i = 0; i < input.serviceTaskIds.length; i++) {
      if (typeof input.serviceTaskIds[i] !== 'string' || !isValidObjectId(input.serviceTaskIds[i] as string)) {
        errors[`serviceTaskIds.${i}`] = 'Valid service task is required';
      }
    }
  }

  // Assignee type
  if (!input.assigneeType || !ASSIGNEE_TYPES.includes(input.assigneeType as AssigneeType)) {
    errors.assigneeType = 'Assignee type must be vendor, mechanic, or third_party';
  }

  // Assignee ID (required for vendor/mechanic)
  if (input.assigneeType === 'vendor' || input.assigneeType === 'mechanic') {
    if (!input.assigneeId || typeof input.assigneeId !== 'string' || !isValidObjectId(input.assigneeId)) {
      errors.assigneeId = `Valid ${input.assigneeType} is required`;
    }
  }

  // Third party fields
  if (input.assigneeType === 'third_party') {
    if (!input.thirdPartyName || typeof input.thirdPartyName !== 'string' || !(input.thirdPartyName as string).trim()) {
      errors.thirdPartyName = 'Third party name is required';
    }
    if (!input.thirdPartyEmail || typeof input.thirdPartyEmail !== 'string' || !(input.thirdPartyEmail as string).trim()) {
      errors.thirdPartyEmail = 'Third party email is required';
    }
  }

  // Status
  if (!input.statusId || typeof input.statusId !== 'string' || !isValidObjectId(input.statusId)) {
    errors.statusId = 'Valid status is required';
  }

  // Description length
  if (input.description && typeof input.description === 'string' && input.description.length > 2000) {
    errors.description = 'Description must be at most 2000 characters';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeWorkOrder(doc: Record<string, unknown>): Record<string, unknown> {
  const wo = doc as unknown as WorkOrder;
  return {
    id: wo._id.toString(),
    workOrderNumber: wo.workOrderNumber,
    assetId: wo.assetId.toString(),
    assetName: wo.assetName || '',
    serviceTaskIds: (wo.serviceTaskIds || []).map((id) => id.toString()),
    assigneeType: wo.assigneeType,
    assigneeId: wo.assigneeId ? wo.assigneeId.toString() : null,
    assigneeName: wo.assigneeName || '',
    assigneeContact: wo.assigneeContact || undefined,
    assigneeEmail: wo.assigneeEmail || undefined,
    assigneePhone: wo.assigneePhone || undefined,
    thirdPartyName: wo.thirdPartyName || undefined,
    thirdPartyEmail: wo.thirdPartyEmail || undefined,
    statusId: wo.statusId.toString(),
    statusLabel: wo.statusLabel || '',
    dueDate: wo.dueDate instanceof Date ? wo.dueDate.toISOString() : wo.dueDate || null,
    description: wo.description || undefined,
    attachments: (wo.attachments || []).map((a) => ({
      url: a.url,
      filename: a.filename,
      originalName: a.originalName,
      contentType: a.contentType,
      size: a.size,
      uploadedAt: a.uploadedAt instanceof Date ? a.uploadedAt.toISOString() : a.uploadedAt,
    })),
    statusHistory: (wo.statusHistory || []).map((s) => ({
      fromStatusId: s.fromStatusId ? s.fromStatusId.toString() : null,
      fromStatusLabel: s.fromStatusLabel,
      toStatusId: s.toStatusId.toString(),
      toStatusLabel: s.toStatusLabel,
      changedBy: s.changedBy.toString(),
      changedAt: s.changedAt instanceof Date ? s.changedAt.toISOString() : s.changedAt,
    })),
    createdAt: wo.createdAt instanceof Date ? wo.createdAt.toISOString() : wo.createdAt,
    updatedAt: wo.updatedAt instanceof Date ? wo.updatedAt.toISOString() : wo.updatedAt,
    isArchived: wo.isArchived,
  };
}

// ---------------------------------------------------------------------------
// WO number generation
// ---------------------------------------------------------------------------

export async function generateWONumber(tenantId: ObjectId): Promise<string> {
  const counters = await getCountersCollection();
  const result = await counters.findOneAndUpdate(
    { _id: `wo_${tenantId.toString()}` as unknown as ObjectId, tenantId },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  const seq = (result?.seq as number) || 1;
  return `WO-${String(seq).padStart(4, '0')}`;
}
