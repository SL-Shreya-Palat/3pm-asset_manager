/**
 * Service Plans controller — hierarchical servicing, mirroring Command.
 *
 * This is AM's PRIMARY servicing model (replaces flat service programs). It is
 * AM-OWNED: works identically in standalone and connected mode — plans are
 * created/edited in Asset Manager either way. The Command history-import only
 * SEEDS plans (insert-if-missing); it never locks or overwrites AM edits.
 *
 * Assets link to a plan via `asset.servicePlanId` (one plan per asset, like
 * Command's assetDetails.servicePlan). Per-schedule due status is derived by
 * calc.ts from the plan's schedules + the asset's service history.
 */
import { ObjectId } from 'mongodb';
import {
  getServicePlansCollection,
  getAssetsCollection,
  getServiceHistoryCollection,
} from '@/lib/mongodb';
import {
  validateCreateServicePlanInput,
  buildSchedules,
  serializeServicePlan,
} from './utils';
import {
  calculateAllScheduleServices,
  type ServiceLog,
  type PerScheduleServiceInfo,
  type NextServiceResult,
} from './calc';
import type { CreateServicePlanInput, UpdateServicePlanInput, ScheduleItem } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** List plans (paginated, search on name), with assigned-asset counts. */
export async function getAllServicePlans(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; showArchived?: boolean } = {},
) {
  const collection = await getServicePlansCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { tenantId };
  filter.tenantId = tenantOid;
  filter.isArchived = options.showArchived ? true : { $ne: true };
  if (options.search) filter.name = { $regex: options.search, $options: 'i' };

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  // Assigned-asset counts in one grouped query.
  const assetsCol = await getAssetsCollection();
  const planIds = items.map((p) => p._id);
  const counts = new Map<string, number>();
  if (planIds.length) {
    const grouped = await assetsCol
      .aggregate([
        { $match: { tenantId: tenantOid, servicePlanId: { $in: planIds }, isArchived: { $ne: true } } },
        { $group: { _id: '$servicePlanId', n: { $sum: 1 } } },
      ])
      .toArray();
    for (const g of grouped) counts.set(String(g._id), g.n as number);
  }

  return {
    items: items.map((p) =>
      serializeServicePlan(p as Record<string, unknown>, {
        assignedAssets: counts.get(String(p._id)) ?? 0,
      }),
    ),
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

export async function getServicePlanById(tenantId: string, planId: string) {
  if (!ObjectId.isValid(planId)) return null;
  const collection = await getServicePlansCollection();
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(planId),
    tenantId: ObjectId.createFromHexString(tenantId),
  });
  return doc ? serializeServicePlan(doc as Record<string, unknown>) : null;
}

export async function createServicePlan(
  tenantId: string,
  userId: string,
  input: CreateServicePlanInput,
) {
  const validation = validateCreateServicePlanInput(input);
  if (!validation.valid) return { data: null, error: validation.errors };

  const collection = await getServicePlansCollection();
  const now = new Date();
  const userOid = ObjectId.createFromHexString(userId);

  const doc: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
    name: input.name.trim(),
    schedules: buildSchedules(input.schedules),
    serviceTaskIds: (input.serviceTaskIds || [])
      .filter((id) => ObjectId.isValid(id))
      .map((id) => ObjectId.createFromHexString(id)),
    source: 'local',
    createdBy: userOid,
    updatedBy: userOid,
    createdAt: now,
    updatedAt: now,
    isActive: true,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  };
  const result = await collection.insertOne(doc);
  return { data: serializeServicePlan({ ...doc, _id: result.insertedId }), error: null };
}

export async function updateServicePlan(
  tenantId: string,
  userId: string,
  planId: string,
  input: UpdateServicePlanInput,
) {
  const collection = await getServicePlansCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const planOid = ObjectId.createFromHexString(planId);

  const existing = await collection.findOne({ _id: planOid, tenantId: tenantOid });
  if (!existing) return { data: null, error: 'Service plan not found' };

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) return { data: null, error: { name: 'Plan name is required' } };
    $set.name = trimmed;
  }
  if (input.schedules !== undefined) {
    // Preserve existing schedule ids by name/id so history references survive edits.
    const prior = new Map(
      (existing.schedules as ScheduleItem[] | undefined)?.map((s) => [s.name, s.id]) ?? [],
    );
    $set.schedules = buildSchedules(
      input.schedules.map((s) => ({ ...s, id: s.id || prior.get(s.name) })),
    );
  }
  if (input.serviceTaskIds !== undefined) {
    $set.serviceTaskIds = input.serviceTaskIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => ObjectId.createFromHexString(id));
  }

  await collection.updateOne({ _id: planOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: planOid });
  return { data: updated ? serializeServicePlan(updated as Record<string, unknown>) : null, error: null };
}

export async function archiveServicePlan(
  tenantId: string,
  userId: string,
  planId: string,
  archived: boolean,
) {
  const collection = await getServicePlansCollection();
  const result = await collection.updateOne(
    { _id: ObjectId.createFromHexString(planId), tenantId: ObjectId.createFromHexString(tenantId) },
    {
      $set: {
        isArchived: archived,
        archivedAt: archived ? new Date() : null,
        archivedBy: archived ? ObjectId.createFromHexString(userId) : null,
        updatedBy: ObjectId.createFromHexString(userId),
        updatedAt: new Date(),
      },
    },
  );
  return result.modifiedCount > 0;
}

/** Assign a plan to a set of assets (sets asset.servicePlanId). Pass null to clear. */
export async function assignPlanToAssets(
  tenantId: string,
  userId: string,
  planId: string | null,
  assetIds: string[],
) {
  const assetsCol = await getAssetsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const oids = assetIds.filter((id) => ObjectId.isValid(id)).map((id) => ObjectId.createFromHexString(id));
  if (!oids.length) return { modified: 0 };
  const res = await assetsCol.updateMany(
    { _id: { $in: oids }, tenantId: tenantOid },
    {
      $set: {
        servicePlanId: planId && ObjectId.isValid(planId) ? ObjectId.createFromHexString(planId) : null,
        updatedBy: ObjectId.createFromHexString(userId),
        updatedAt: new Date(),
      },
    },
  );
  return { modified: res.modifiedCount };
}

/** Build normalized ServiceLogs for an asset from its service history. */
async function loadAssetServiceLogs(tenantOid: ObjectId, assetOid: ObjectId): Promise<ServiceLog[]> {
  const historyCol = await getServiceHistoryCollection();
  const rows = await historyCol
    .find({ tenantId: tenantOid, assetId: assetOid })
    .sort({ performedAt: -1 })
    .toArray();
  return rows
    // Match Command exactly: ONLY approved servicings reset a schedule. Servicings
    // imported from Command carry their status in `commandData.status` — draft and
    // voided ones must NOT count as the last service (Command excludes them too).
    // Native Asset Manager service logs have no Command status and always count.
    .filter((h: any) => {
      const cmdStatus = h.commandData?.status;
      return cmdStatus == null || cmdStatus === 'approved';
    })
    .map((h: any) => {
    const meterType = h.meterType as string | null;
    const meter = typeof h.meterAtService === 'number' ? h.meterAtService : null;
    return {
      scheduleRef: h.servicePlanSchedule ? String(h.servicePlanSchedule) : null,
      serviceDate: h.performedAt ? new Date(h.performedAt) : null,
      odometer: meterType === 'odometer' ? meter : null,
      hubometer: null,
      engineHours: meterType === 'engine_hours' ? meter : null,
      createdAt: h.createdAt ? new Date(h.createdAt) : null,
    };
  });
}

export interface AssetServiceStatus {
  planId: string | null;
  planName: string | null;
  perSchedule: PerScheduleServiceInfo[];
  mostUrgent: NextServiceResult;
}

/** Per-schedule due status for one asset (asset detail Service tab). */
export async function getAssetServiceStatus(
  tenantId: string,
  assetId: string,
): Promise<AssetServiceStatus> {
  const empty: AssetServiceStatus = {
    planId: null,
    planName: null,
    perSchedule: [],
    mostUrgent: { value: null, unit: '', status: 'no-plan', nextCalendarDate: null },
  };
  if (!ObjectId.isValid(assetId)) return empty;
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const assetOid = ObjectId.createFromHexString(assetId);

  const assetsCol = await getAssetsCollection();
  const asset: any = await assetsCol.findOne({ _id: assetOid, tenantId: tenantOid });
  if (!asset?.servicePlanId) return empty;

  const plansCol = await getServicePlansCollection();
  const plan: any = await plansCol.findOne({ _id: asset.servicePlanId, tenantId: tenantOid });
  if (!plan) return empty;

  const logs = await loadAssetServiceLogs(tenantOid, assetOid);
  const { perSchedule, mostUrgent } = calculateAllScheduleServices(
    plan.schedules as ScheduleItem[],
    logs,
    {
      odometer: asset.currentOdometer ?? null,
      hubometer: asset.hubometer ?? null,
      engineHours: asset.currentEngineHours ?? null,
    },
  );
  return {
    planId: String(plan._id),
    planName: plan.name as string,
    perSchedule,
    mostUrgent,
  };
}
