/**
 * Driver Wellness domain types — TypeScript interfaces for the
 * driverWellnessChecks collection.
 */
import { ObjectId } from 'mongodb';

/** Stored wellness check document. */
export interface DriverWellnessCheck {
  _id: ObjectId;
  tenantId: ObjectId;
  driverId: ObjectId;
  driverName: string;

  // Wellness responses
  fitToWork: boolean;
  freeOfFatigue: boolean;
  freeOfSubstances: boolean;
  noImpairingCondition: boolean;
  hoursOfSleep: number | null;
  comments: string | null;
  signatureUrl: string | null;

  // Computed
  result: 'pass' | 'fail';

  // Audit
  submittedAt: Date;
  createdBy: ObjectId;
  createdAt: Date;
  isArchived: boolean;
}

/** Input for creating a wellness check. */
export interface CreateWellnessCheckInput {
  driverId: string;
  fitToWork: boolean;
  freeOfFatigue: boolean;
  freeOfSubstances: boolean;
  noImpairingCondition: boolean;
  hoursOfSleep?: number | null;
  comments?: string | null;
  signatureUrl?: string | null;
}

/** Summary stats returned by the summary endpoint. */
export interface DriverWellnessSummary {
  totalDrivers: number;
  checkedToday: number;
  passedToday: number;
  failedToday: number;
}
