/** Frontend types for the service-tasks module. */

export interface ServiceTaskRow {
  id: string;
  title: string;
  description?: string;
  laborCost?: number;
  partsCost?: number;
  totalCost?: number;
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
