import { ObjectId } from 'mongodb';

/** The lifecycle phase a work order status belongs to. */
export const WORK_ORDER_STATUS_TYPES = ['open', 'in_progress', 'on_hold', 'completed', 'cancelled'] as const;
export type WorkOrderStatusType = (typeof WORK_ORDER_STATUS_TYPES)[number];

/** Human-readable labels for each status type. */
export const STATUS_TYPE_LABELS: Record<WorkOrderStatusType, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Stored work order status document. */
export interface WorkOrderStatus {
  _id: ObjectId;
  tenantId: ObjectId;
  label: string;
  color: string;
  description?: string;
  type: WorkOrderStatusType;
  sequence: number;
  /** True for the default statuses seeded for every tenant — these are part of
   * the core work-order lifecycle and can't be archived or deleted. */
  isSystem?: boolean;
  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
  archivedAt?: Date | null;
  archivedBy?: ObjectId | null;
}

/** Input for creating a work order status. */
export interface CreateWorkOrderStatusInput {
  label: string;
  color: string;
  description?: string;
  type: WorkOrderStatusType;
}

/** Input for updating a work order status. */
export type UpdateWorkOrderStatusInput = Partial<CreateWorkOrderStatusInput>;
