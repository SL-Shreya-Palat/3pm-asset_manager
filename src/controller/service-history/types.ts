/**
 * Service History domain types — a completed preventative-maintenance service.
 * Program/task names are snapshotted so history stays stable if a program is
 * later renamed or archived.
 */
import { ObjectId } from 'mongodb';

export type ServiceMeterType = 'odometer' | 'engine_hours';

export interface ServiceHistoryDoc {
  _id: ObjectId;
  tenantId: ObjectId;
  assetId: ObjectId;
  workOrderId?: ObjectId | null;
  servicePrograms: ObjectId[];
  programNames: string[];
  serviceTaskIds: ObjectId[];
  taskNames: string[];
  performedAt: Date;
  meterType?: ServiceMeterType | null;
  meterAtService?: number | null;
  totalCost?: number | null;
  notes?: string | null;
  performedById?: ObjectId | null;
  performedByName?: string | null;
  source: 'manual' | 'work_order';
  createdAt: Date;
}

export interface LogServiceInput {
  assetId: string;
  workOrderId?: string;
  servicePrograms?: string[];
  serviceTaskIds?: string[];
  performedAt?: string;
  meterType?: string;
  meterAtService?: number;
  totalCost?: number;
  notes?: string;
}
