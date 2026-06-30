import { ObjectId } from 'mongodb';

export const ASSIGNEE_TYPES = ['vendor', 'mechanic', 'third_party'] as const;
export type AssigneeType = (typeof ASSIGNEE_TYPES)[number];

/** Embedded attachment on a work order. */
export interface WOAttachment {
  url: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
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
  assigneeType: string;
  assigneeId?: string;
  thirdPartyName?: string;
  thirdPartyEmail?: string;
  statusId: string;
  dueDate?: string;
  description?: string;
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
