/**
 * Service Program domain types -- TypeScript interfaces for the servicePrograms collection.
 */
import { ObjectId } from 'mongodb';

/** Interval type: repeat or one-time. */
export const INTERVAL_TYPES = ['repeat', 'one_time'] as const;
export type IntervalType = (typeof INTERVAL_TYPES)[number];

/** Calendar repeat units. */
export const CALENDAR_UNITS = ['day', 'week', 'month', 'year'] as const;
export type CalendarUnit = (typeof CALENDAR_UNITS)[number];

/** Time unit for reminders. */
export const TIME_UNITS = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'] as const;
export type TimeUnit = (typeof TIME_UNITS)[number];

/** Ends type for repeat intervals. */
export const ENDS_TYPES = ['never', 'on', 'after', 'meter_reading'] as const;
export type EndsType = (typeof ENDS_TYPES)[number];

/** Reminder notification channels. */
export const REMINDER_CHANNELS = ['dashboard', 'email'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

/** Repeat condition: mileage-based. */
export interface RepeatMileage {
  enabled: boolean;
  every: number;
}

/** Repeat condition: engine-hours-based. */
export interface RepeatEngineHours {
  enabled: boolean;
  every: number;
}

/** Repeat condition: calendar-based. */
export interface RepeatCalendar {
  enabled: boolean;
  every: number;
  unit: CalendarUnit;
}

/** Ends configuration for repeat intervals. */
export interface IntervalEnds {
  type: EndsType;
  /** For 'on': the end date. */
  date?: Date;
  /** For 'after': the number of occurrences. */
  occurrences?: number;
  /** For 'meter_reading': the odometer value in km at which the schedule ends. */
  meterReading?: number;
}

/** One-time condition mode. */
export const ONE_TIME_MODES = ['at', 'in'] as const;
export type OneTimeMode = (typeof ONE_TIME_MODES)[number];

/** One-time mileage / engine-hours condition. */
export interface OneTimeCondition {
  enabled: boolean;
  mode: OneTimeMode;
  value: number;
}

/** One-time date condition. */
export interface OneTimeDateCondition {
  enabled: boolean;
  date?: Date;
}

/** Interval / schedule configuration. */
export interface ServiceInterval {
  type: IntervalType;

  /** Repeat conditions (whichever occurs first). */
  mileage?: RepeatMileage;
  engineHours?: RepeatEngineHours;
  calendar?: RepeatCalendar;

  /** When the repeat schedule ends. */
  ends?: IntervalEnds;

  /** One-time conditions. */
  dueMileage?: OneTimeCondition;
  dueEngineHours?: OneTimeCondition;
  dueOnDate?: OneTimeDateCondition;
}

/** Threshold condition for mileage or engine hours. */
export interface ThresholdCondition {
  enabled: boolean;
  value: number;
}

/** Threshold condition for calendar-based. */
export interface ThresholdCalendarCondition {
  enabled: boolean;
  value: number;
  unit: CalendarUnit;
}

/** Reminder configuration. */
export interface ServiceReminder {
  thresholdMileage?: ThresholdCondition;
  thresholdEngineHours?: ThresholdCondition;
  thresholdCalendar?: ThresholdCalendarCondition;
  autoCreateWorkOrder: boolean;
  mechanicId?: ObjectId;
  channels: ReminderChannel[];
  recipientSelf: boolean;
}

/** Stored service program document. */
export interface ServiceProgram {
  _id: ObjectId;
  tenantId: ObjectId;

  // Details
  title: string;
  serviceTaskIds: ObjectId[];

  // Interval
  interval: ServiceInterval;

  // Assets this program applies to (drives per-asset due status)
  assetIds: ObjectId[];

  // Reminders
  reminders: ServiceReminder;

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
  serviceTaskIds?: string[];
  interval?: {
    type: string;
    mileage?: { enabled: boolean; every: number };
    engineHours?: { enabled: boolean; every: number };
    calendar?: { enabled: boolean; every: number; unit: string };
    ends?: { type: string; date?: string; occurrences?: number; meterReading?: number };
    dueMileage?: { enabled: boolean; mode: string; value: number };
    dueEngineHours?: { enabled: boolean; mode: string; value: number };
    dueOnDate?: { enabled: boolean; date?: string };
  };
  assetIds?: string[];
  reminders?: {
    thresholdMileage?: { enabled: boolean; value: number };
    thresholdEngineHours?: { enabled: boolean; value: number };
    thresholdCalendar?: { enabled: boolean; value: number; unit: string };
    autoCreateWorkOrder?: boolean;
    mechanicId?: string;
    channels?: string[];
    recipientSelf?: boolean;
  };
}

/** Input for updating a service program. */
export type UpdateServiceProgramInput = Partial<CreateServiceProgramInput>;

/** Serialized service program for API responses. */
export interface ServiceProgramResponse {
  id: string;
  title: string;
  serviceTaskIds: string[];
  interval: {
    type: string;
    mileage?: { enabled: boolean; every: number };
    engineHours?: { enabled: boolean; every: number };
    calendar?: { enabled: boolean; every: number; unit: string };
    ends?: { type: string; date?: string; occurrences?: number; meterReading?: number };
    dueMileage?: { enabled: boolean; mode: string; value: number };
    dueEngineHours?: { enabled: boolean; mode: string; value: number };
    dueOnDate?: { enabled: boolean; date?: string };
  };
  assetIds: string[];
  reminders: {
    thresholdMileage?: { enabled: boolean; value: number };
    thresholdEngineHours?: { enabled: boolean; value: number };
    thresholdCalendar?: { enabled: boolean; value: number; unit: string };
    autoCreateWorkOrder: boolean;
    mechanicId?: string;
    channels: string[];
    recipientSelf: boolean;
  };
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
