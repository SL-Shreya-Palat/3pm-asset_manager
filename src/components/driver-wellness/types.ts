/** Client-side types for the Driver Wellness page. */

export interface WellnessCheckRow {
  id: string;
  driverId: string;
  driverName: string;
  fitToWork: boolean;
  freeOfFatigue: boolean;
  freeOfSubstances: boolean;
  noImpairingCondition: boolean;
  hoursOfSleep: number | null;
  comments: string | null;
  signatureUrl: string | null;
  result: 'pass' | 'fail';
  submittedAt: string | null;
  createdAt: string | null;
}

export interface WellnessSummary {
  totalDrivers: number;
  checkedToday: number;
  passedToday: number;
  failedToday: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
