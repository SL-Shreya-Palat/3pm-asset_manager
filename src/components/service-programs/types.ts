/** Frontend types for the service-programs module. */

export interface ServiceTriggerRow {
  triggerType: string;
  intervalType: string;
  interval: number;
  timeUnit?: string;
  reminderThreshold?: number;
}

export interface ServiceProgramRow {
  id: string;
  title: string;
  description?: string;
  category: string;
  serviceTaskIds: string[];
  triggers: ServiceTriggerRow[];
  createdAt: string;
}

/** Minimal service task used for selection in the program form. */
export interface ServiceTaskOption {
  id: string;
  title: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
