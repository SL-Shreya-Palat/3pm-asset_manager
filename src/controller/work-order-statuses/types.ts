import { ObjectId } from 'mongodb';

/** Stored work order status document. */
export interface WorkOrderStatus {
  _id: ObjectId;
  tenantId: ObjectId;
  label: string;
  color: string;
  description?: string;
  approvalRequired: boolean;
  sequence: number;
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
  approvalRequired?: boolean;
}

/** Input for updating a work order status. */
export type UpdateWorkOrderStatusInput = Partial<CreateWorkOrderStatusInput>;
