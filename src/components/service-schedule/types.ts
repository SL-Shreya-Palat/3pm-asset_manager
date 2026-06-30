/** Frontend types for the service-schedule module. */

export type ScheduleStatus = 'overdue' | 'due_soon' | 'upcoming';

export interface DueDimensionRow {
  type: 'mileage' | 'engineHours' | 'calendar';
  nextDueValue: number | string;
  currentValue: number | string;
  remaining: number;
  unit: string;
  status: ScheduleStatus;
}

export interface ServiceScheduleRow {
  id: string;
  programId: string;
  programTitle: string;
  assetId: string;
  assetName: string;
  assetNumber?: string;
  serviceTaskIds: string[];
  serviceTaskTitles: string[];
  intervalType: 'repeat' | 'one_time';
  dueDimensions: DueDimensionRow[];
  status: ScheduleStatus;
  sortPriority: number;
  urgencyValue: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
