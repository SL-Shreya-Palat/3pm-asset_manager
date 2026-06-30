/** Frontend types for the service-programs module. */

export interface RepeatCondition {
  enabled: boolean;
  every: number;
}

export interface RepeatCalendarCondition {
  enabled: boolean;
  every: number;
  unit: string;
}

export interface IntervalEndsRow {
  type: 'never' | 'on' | 'after';
  date?: string;
  occurrences?: number;
}

export interface OneTimeConditionRow {
  enabled: boolean;
  mode: 'at' | 'in';
  value: number;
}

export interface OneTimeDateRow {
  enabled: boolean;
  date?: string;
}

export interface ServiceIntervalRow {
  type: 'repeat' | 'one_time';
  mileage?: RepeatCondition;
  engineHours?: RepeatCondition;
  calendar?: RepeatCalendarCondition;
  ends?: IntervalEndsRow;
  dueMileage?: OneTimeConditionRow;
  dueEngineHours?: OneTimeConditionRow;
  dueOnDate?: OneTimeDateRow;
}

export interface ThresholdConditionRow {
  enabled: boolean;
  value: number;
}

export interface ThresholdCalendarRow {
  enabled: boolean;
  value: number;
  unit: string;
}

export interface ServiceReminderRow {
  thresholdMileage?: ThresholdConditionRow;
  thresholdEngineHours?: ThresholdConditionRow;
  thresholdCalendar?: ThresholdCalendarRow;
  autoCreateWorkOrder: boolean;
  mechanicId?: string;
  channels: string[];
  recipientSelf: boolean;
}

export interface ServiceProgramRow {
  id: string;
  title: string;
  serviceTaskIds: string[];
  interval: ServiceIntervalRow;
  assetIds: string[];
  reminders: ServiceReminderRow;
  createdAt: string;
}

/** Minimal service task used for selection in the program form. */
export interface ServiceTaskOption {
  id: string;
  title: string;
}

/** Minimal asset used for selection in the program form. */
export interface AssetOption {
  id: string;
  name: string;
  assetNumber?: string;
  make?: string;
  model?: string;
  status?: string;
}

/** Minimal user/mechanic used for selection. */
export interface MechanicOption {
  id: string;
  name: string;
  email?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
