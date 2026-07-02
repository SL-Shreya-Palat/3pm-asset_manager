import { ObjectId } from 'mongodb';

export const ASSIGNEE_TYPES = ['vendor', 'mechanic', 'third_party'] as const;
export type AssigneeType = (typeof ASSIGNEE_TYPES)[number];

/** How a work order originated. `defect` = raised to correct defects; `fault` = raised to resolve faults. */
export const WO_SOURCES = ['manual', 'defect', 'fault'] as const;
export type WOSource = (typeof WO_SOURCES)[number];

/** Embedded attachment on a work order. */
export interface WOAttachment {
  url: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
}

/** A part consumed on a work order (denormalized line). */
export interface WOPart {
  partId: ObjectId;
  partName: string;
  partNumber: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

/** Status history entry. */
export interface WOStatusEntry {
  fromStatusId: ObjectId | null;
  fromStatusLabel: string | null;
  toStatusId: ObjectId;
  toStatusLabel: string;
  changedBy: ObjectId;
  changedAt: Date;
}

/** Stored work order document. */
export interface WorkOrder {
  _id: ObjectId;
  tenantId: ObjectId;
  workOrderNumber: string;
  assetId: ObjectId;
  assetName: string;
  serviceTaskIds: ObjectId[];
  /** Source of the work order — 'manual' (default) or 'defect' when raised to correct defects. */
  source?: WOSource;
  /** Defects this work order is correcting (set when source === 'defect'). */
  defectIds?: ObjectId[];
  /** Faults this work order is resolving (set when source === 'fault'). */
  faultIds?: ObjectId[];
  assigneeType: AssigneeType;
  assigneeId?: ObjectId | null;
  assigneeName: string;
  assigneeContact?: string;
  assigneeEmail?: string;
  assigneePhone?: string;
  thirdPartyName?: string;
  thirdPartyEmail?: string;
  statusId: ObjectId;
  statusLabel: string;
  dueDate?: Date | null;
  description?: string;
  /** Parts consumed on this WO (deducted from inventory). */
  parts?: WOPart[];
  partsCost?: number;
  /** Completion / sign-off (deterministic, independent of the free-form status). */
  isCompleted?: boolean;
  completedAt?: Date | null;
  completedBy?: ObjectId | null;
  attachments: WOAttachment[];
  statusHistory: WOStatusEntry[];
  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  isArchived: boolean;
  archivedAt?: Date | null;
  archivedBy?: ObjectId | null;
}

/** Input for creating a work order. */
export interface CreateWorkOrderInput {
  assetId: string;
  serviceTaskIds: string[];
  /** 'manual', 'defect', or 'fault'. When 'defect'/'fault', serviceTaskIds may be empty. */
  source?: string;
  /** Defects to correct — links them to this WO and moves them to in_progress. */
  defectIds?: string[];
  /** Faults to resolve — links them to this WO and moves them to in_progress. */
  faultIds?: string[];
  assigneeType: string;
  assigneeId?: string;
  thirdPartyName?: string;
  thirdPartyEmail?: string;
  statusId: string;
  dueDate?: string;
  description?: string;
  /** Parts to record on the WO — quantities are deducted from inventory. */
  parts?: Array<{ partId: string; quantity: number; unitCost?: number }>;
  attachments?: Array<{
    url: string;
    filename: string;
    originalName: string;
    contentType: string;
    size: number;
  }>;
}

/** Input for updating a work order. */
export type UpdateWorkOrderInput = Partial<CreateWorkOrderInput>;
