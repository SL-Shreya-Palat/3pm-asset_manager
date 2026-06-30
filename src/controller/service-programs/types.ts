/**
 * Service Program domain types -- TypeScript interfaces for the servicePrograms collection.
 */
import { ObjectId } from 'mongodb';

/** Program categories. */
export const SERVICE_PROGRAM_CATEGORIES = [
  'scheduled_maintenance',
  'unscheduled_maintenance',
  'inspections',
  'custom',
] as const;
export type ServiceProgramCategory = (typeof SERVICE_PROGRAM_CATEGORIES)[number];

/** Trigger types for when a service is due. */
export const SERVICE_TRIGGER_TYPES = ['time', 'distance', 'engine_hours'] as const;
export type ServiceTriggerType = (typeof SERVICE_TRIGGER_TYPES)[number];

/** Interval type: repeat or one-time. */
export const INTERVAL_TYPES = ['repeat', 'one_time'] as const;
export type IntervalType = (typeof INTERVAL_TYPES)[number];

/** Time unit for time-based triggers. */
export const TIME_UNITS = ['days', 'weeks', 'months'] as const;
export type TimeUnit = (typeof TIME_UNITS)[number];

/** A single trigger rule on a service program. */
export interface ServiceTrigger {
  triggerType: ServiceTriggerType;
  intervalType: IntervalType;
  interval: number;            // value in the unit below
  timeUnit?: TimeUnit;         // only for time-based triggers
  reminderThreshold?: number;  // warn X units before due
}

/** Stored service program document. */
export interface ServiceProgram {
  _id: ObjectId;
  tenantId: ObjectId;

  // Core fields
  title: string;
  description?: string;
  category: ServiceProgramCategory;

  // Service tasks
  serviceTaskIds: ObjectId[];

  // Triggers / intervals
  triggers: ServiceTrigger[];

  // Base fields
  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  isArchived: boolean;
  archivedAt?: Date | null;
  archivedBy?: ObjectId | null;
}

/** Input for creating a service program. */
export interface CreateServiceProgramInput {
  title: string;
  description?: string;
  category?: string;
  serviceTaskIds?: string[];
  triggers?: Array<{
    triggerType: string;
    intervalType: string;
    interval: number;
    timeUnit?: string;
    reminderThreshold?: number;
  }>;
}

/** Input for updating a service program. */
export type UpdateServiceProgramInput = Partial<CreateServiceProgramInput>;

/** Serialized service program for API responses. */
export interface ServiceProgramResponse {
  id: string;
  title: string;
  description?: string;
  category: string;
  serviceTaskIds: string[];
  triggers: Array<{
    triggerType: string;
    intervalType: string;
    interval: number;
    timeUnit?: string;
    reminderThreshold?: number;
  }>;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
