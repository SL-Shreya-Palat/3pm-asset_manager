/**
 * Defect domain types — TypeScript interfaces for the defects collection.
 */
import { ObjectId } from 'mongodb';

/** Defect status values. */
export const DEFECT_STATUSES = ['new', 'in_progress', 'corrected', 'no_correction_needed'] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

/** Defect severity values used in the priority field. */
export const DEFECT_PRIORITIES = ['high', 'medium', 'low'] as const;
export type DefectPriority = (typeof DEFECT_PRIORITIES)[number];

/** Defect severity values. */
export const DEFECT_SEVERITIES = ['critical', 'non_critical'] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

/** File attachment on a defect. */
export interface DefectAttachment {
  url: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
}

/** Stored defect document. */
export interface Defect {
  _id: ObjectId;
  tenantId: ObjectId;
  defectNumber: string; // DF-0001

  name: string;
  date: Date;
  comment: string;

  assetId: ObjectId;
  assetName: string; // denormalized

  driverId?: ObjectId | null;
  driverName?: string | null; // denormalized

  priority: DefectPriority;
  severity: DefectSeverity;
  status: DefectStatus;

  /** Linked correction work order, set when a WO is raised for this defect. */
  workOrderId?: ObjectId | null;
  workOrderNumber?: string | null; // denormalized

  attachments: DefectAttachment[];

  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
  archivedAt?: Date | null;
  archivedBy?: ObjectId | null;
}

/** Input for creating a defect. */
export interface CreateDefectInput {
  name: string;
  date: string; // ISO date string
  comment: string;
  assetId: string;
  driverId?: string;
  priority: string;
  severity?: string;
  status?: string;
  attachments?: Array<{
    url: string;
    filename: string;
    originalName: string;
    contentType: string;
    size: number;
  }>;
}

/** Input for updating a defect. */
export type UpdateDefectInput = Partial<CreateDefectInput>;
