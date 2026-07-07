/**
 * Service plan validation + serialization + schedule normalization.
 */
import { ObjectId } from 'mongodb';
import type {
  ScheduleItem,
  ScheduleItemInput,
  ServicePlanResponse,
  CreateServicePlanInput,
} from './types';

export function validateCreateServicePlanInput(
  input: CreateServicePlanInput,
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!input.name || !input.name.trim()) errors.name = 'Plan name is required';
  else if (input.name.trim().length > 160) errors.name = 'Plan name must be at most 160 characters';
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Normalize schedule inputs into stored ScheduleItems: assign stable ids,
 * default recurring/archived, and fill sortOrder from array order when absent.
 */
export function buildSchedules(inputs: ScheduleItemInput[] | undefined): ScheduleItem[] {
  return (inputs || [])
    .filter((s) => s && s.name && s.name.trim())
    .map((s, i) => ({
      id: s.id && s.id.trim() ? s.id : new ObjectId().toHexString(),
      name: s.name.trim(),
      unitOfMeasurement: (s.unitOfMeasurement || '').trim(),
      serviceInterval:
        s.serviceInterval == null || Number.isNaN(Number(s.serviceInterval))
          ? null
          : Number(s.serviceInterval),
      recurring: s.recurring !== false,
      archived: s.archived === true,
      sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : i + 1,
      serviceGroup:
        s.serviceGroup == null || Number.isNaN(Number(s.serviceGroup))
          ? null
          : Number(s.serviceGroup),
    }));
}

export function serializeServicePlan(
  doc: Record<string, unknown>,
  extra: { assignedAssets?: number } = {},
): ServicePlanResponse {
  const schedules = Array.isArray(doc.schedules) ? (doc.schedules as ScheduleItem[]) : [];
  return {
    id: (doc._id as ObjectId).toString(),
    name: (doc.name as string) || '',
    schedules: schedules.map((s) => ({
      id: String(s.id),
      name: s.name || '',
      unitOfMeasurement: s.unitOfMeasurement || '',
      serviceInterval: s.serviceInterval ?? null,
      recurring: s.recurring !== false,
      archived: s.archived === true,
      sortOrder: s.sortOrder ?? 0,
      serviceGroup: s.serviceGroup ?? null,
    })),
    serviceTaskIds: Array.isArray(doc.serviceTaskIds)
      ? (doc.serviceTaskIds as ObjectId[]).map((id) => id.toString())
      : [],
    source: (doc.source as string) || 'local',
    ...(extra.assignedAssets != null ? { assignedAssets: extra.assignedAssets } : {}),
    isActive: (doc.isActive as boolean) ?? true,
    isArchived: (doc.isArchived as boolean) ?? false,
    createdAt: doc.createdAt ? new Date(doc.createdAt as Date).toISOString() : '',
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as Date).toISOString() : '',
  };
}
