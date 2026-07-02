/**
 * Fault domain types — TypeScript interfaces for the faults collection.
 *
 * A Fault is a manually-reported problem (driver/mechanic) outside any
 * inspection — the third work-order origin alongside Service and Defect.
 */
import { ObjectId } from 'mongodb';

/** Fault status values. */
export const FAULT_STATUSES = ['open', 'in_progress', 'resolved', 'wont_fix'] as const;
export type FaultStatus = (typeof FAULT_STATUSES)[number];

/** Fault priority values. */
export const FAULT_PRIORITIES = ['high', 'medium', 'low'] as const;
export type FaultPriority = (typeof FAULT_PRIORITIES)[number];

/** Fault severity values. */
export const FAULT_SEVERITIES = ['critical', 'non_critical'] as const;
export type FaultSeverity = (typeof FAULT_SEVERITIES)[number];

/** Fault category values. */
export const FAULT_CATEGORIES = [
  'mechanical',
  'electrical',
  'hydraulic',
  'body',
  'tyres',
  'safety',
  'other',
] as const;
export type FaultCategory = (typeof FAULT_CATEGORIES)[number];

/** Reporter type — who reported the fault. */
export const REPORTED_BY_TYPES = ['driver', 'member'] as const;
export type ReportedByType = (typeof REPORTED_BY_TYPES)[number];

/** File attachment on a fault. */
export interface FaultAttachment {
  url: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
}

/** Stored fault document. */
export interface Fault {
  _id: ObjectId;
  tenantId: ObjectId;
  faultNumber: string; // FLT-0001

  title: string;
  description: string;
  reportedAt: Date;

  assetId: ObjectId;
  // assetName resolved on READ — not stored

  reportedByType: ReportedByType;
  reportedById: ObjectId;
  // reportedByName resolved on READ — not stored

  category: FaultCategory;
  priority: FaultPriority;
  severity: FaultSeverity;
  status: FaultStatus;

  meterType?: string | null;
  meterReading?: number | null;

  /** If true, the asset was grounded when the fault was reported. */
  takeOutOfService: boolean;

  /** Linked work order, set when a WO is raised for this fault. */
  workOrderId?: ObjectId | null;
  workOrderNumber?: string | null;

  teamIds?: ObjectId[];
  attachments: FaultAttachment[];

  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
  archivedAt?: Date | null;
  archivedBy?: ObjectId | null;
}

/** Input for creating a fault. */
export interface CreateFaultInput {
  title: string;
  description: string;
  reportedAt: string; // ISO date string
  assetId: string;
  reportedByType: string;
  reportedById: string;
  category: string;
  priority: string;
  severity?: string;
  meterType?: string;
  meterReading?: number;
  takeOutOfService?: boolean;
  attachments?: Array<{
    url: string;
    filename: string;
    originalName: string;
    contentType: string;
    size: number;
  }>;
}

/** Input for updating a fault. */
export type UpdateFaultInput = Partial<CreateFaultInput> & { status?: string };
