/**
 * Service Plan domain types — hierarchical servicing, mirroring
 * construction-portal's servicePlans model exactly.
 *
 * A plan groups many schedules. Schedules sharing a `serviceGroup` number are
 * linked by `sortOrder`: servicing a higher-order schedule (e.g. Service C)
 * also resets every lower-order one in the same group (A, B). A schedule in its
 * own group is tracked independently.
 */
import { ObjectId } from 'mongodb';

/** Units a schedule interval can be measured in (matches Command). */
export const SCHEDULE_UNITS = ['Kilometers', 'Hours', 'Days', 'Months'] as const;
export type ScheduleUnit = (typeof SCHEDULE_UNITS)[number];

/** One schedule inside a plan (mirrors Command's ScheduleItem). */
export interface ScheduleItem {
  /** Stable id so servicings can reference a specific schedule across edits. */
  id: string;
  name: string;
  /** Kilometers | Hours | Days | Months (free string like Command; matched loosely). */
  unitOfMeasurement: string;
  serviceInterval: number | null;
  recurring: boolean;
  archived: boolean;
  sortOrder: number;
  /** Hierarchical service group number (starts at 1); null = own group. */
  serviceGroup: number | null;
}

/** Stored service plan document. */
export interface ServicePlan {
  _id: ObjectId;
  tenantId: ObjectId;
  name: string;
  schedules: ScheduleItem[];
  /** Service tasks performed under this plan (optional, for display). */
  serviceTaskIds: ObjectId[];

  // Command linkage (set only for imported plans)
  source?: 'command' | 'local';
  commandServicePlanId?: string;

  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  isArchived: boolean;
  archivedAt?: Date | null;
  archivedBy?: ObjectId | null;
}

/** Input schedule (id optional — generated when absent). */
export interface ScheduleItemInput {
  id?: string;
  name: string;
  unitOfMeasurement: string;
  serviceInterval: number | null;
  recurring?: boolean;
  archived?: boolean;
  sortOrder?: number;
  serviceGroup?: number | null;
}

export interface CreateServicePlanInput {
  name: string;
  schedules?: ScheduleItemInput[];
  serviceTaskIds?: string[];
}

export type UpdateServicePlanInput = Partial<CreateServicePlanInput>;

/** Serialized schedule for API responses. */
export interface ScheduleItemResponse {
  id: string;
  name: string;
  unitOfMeasurement: string;
  serviceInterval: number | null;
  recurring: boolean;
  archived: boolean;
  sortOrder: number;
  serviceGroup: number | null;
}

/** Serialized plan for API responses. */
export interface ServicePlanResponse {
  id: string;
  name: string;
  schedules: ScheduleItemResponse[];
  serviceTaskIds: string[];
  source: string;
  assignedAssets?: number;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
