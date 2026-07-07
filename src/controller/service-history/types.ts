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
  /** Hierarchical service plan this service was performed under (primary model). */
  servicePlanId?: ObjectId | null;
  /** The schedule (id) within the plan that was serviced — drives the group
   *  reset in calc.ts (servicing Service C resets A + B in the same group). */
  servicePlanSchedule?: string | null;
  servicePlanScheduleName?: string | null;
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
  /** Preferred: the plan + schedule that was serviced (hierarchical model). */
  servicePlanId?: string;
  servicePlanSchedule?: string;
  serviceTaskIds?: string[];
  performedAt?: string;
  meterType?: string;
  meterAtService?: number;
  totalCost?: number;
  notes?: string;
}
