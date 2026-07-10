/** Driver-inspection schedule types (per-tenant singleton). */
import type { ObjectId } from 'mongodb';

/**
 * How often a driver must complete their assigned inspection.
 * Calendar-period based: the check resets at the start of each period
 * (midnight for daily, Monday for weekly, the 1st for monthly).
 */
export type DriverInspectionFrequency = 'daily' | 'weekly' | 'monthly';

export const DRIVER_INSPECTION_FREQUENCIES: DriverInspectionFrequency[] = [
  'daily',
  'weekly',
  'monthly',
];

/** Stored settings document (one per tenant). */
export interface DriverInspectionSettingsDocument {
  _id: ObjectId;
  tenantId: ObjectId;
  /** Master on/off — when off, no driver is ever prompted. */
  enabled: boolean;
  /** The driver-type form drivers must complete. Null until an admin picks one. */
  formId: ObjectId | null;
  /** How often the check must be completed. */
  frequency: DriverInspectionFrequency;
  updatedBy?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/** Serialized settings for API responses. */
export interface DriverInspectionSettingsResponse {
  enabled: boolean;
  formId: string | null;
  formTitle: string | null;
  frequency: DriverInspectionFrequency;
  updatedAt: string | null;
}

/** Input for saving settings. */
export interface DriverInspectionSettingsInput {
  enabled: boolean;
  formId: string | null;
  frequency: DriverInspectionFrequency;
}

/** Where a driver stands against the schedule right now. */
export type DriverInspectionStatus =
  | 'disabled' // policy off, or no form assigned
  | 'up_to_date' // completed within the current period
  | 'due' // not done this period (last period was fine)
  | 'overdue'; // not done this period and missed the previous period (or never done)

/** Computed schedule status for one driver. */
export interface DriverInspectionDueResult {
  /** Policy is enabled AND a form is assigned. */
  enabled: boolean;
  /** True when the driver must complete a check before continuing (due or overdue). */
  due: boolean;
  status: DriverInspectionStatus;
  frequency: DriverInspectionFrequency;
  formId: string | null;
  formTitle: string | null;
  /** driver being evaluated. */
  driverId: string | null;
  /** ISO timestamp of the driver's most recent completed inspection, if any. */
  lastCompletedAt: string | null;
  /** ISO timestamp of when the current period ends / next one begins. */
  nextDueAt: string | null;
}
