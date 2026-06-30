/**
 * Service Task domain types -- TypeScript interfaces for the serviceTasks collection.
 */
import { ObjectId } from 'mongodb';

/** Stored service task document. */
export interface ServiceTask {
  _id: ObjectId;
  tenantId: ObjectId;

  // Core fields
  title: string;
  description?: string;

  // Cost breakdown
  laborCost?: number;
  partsCost?: number;
  totalCost?: number;

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

/** Input for creating a service task. */
export interface CreateServiceTaskInput {
  title: string;
  description?: string;
  laborCost?: number;
  partsCost?: number;
  totalCost?: number;
}

/** Input for updating a service task. */
export type UpdateServiceTaskInput = Partial<CreateServiceTaskInput>;

/** Serialized service task for API responses. */
export interface ServiceTaskResponse {
  id: string;
  title: string;
  description?: string;
  laborCost?: number;
  partsCost?: number;
  totalCost?: number;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
