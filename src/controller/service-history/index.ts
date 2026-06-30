/**
 * Service history controller — records completed services and resets the
 * schedule (next-due is derived from the latest history entry).
 *
 * `logServiceEntry` is the single writer used by both the manual "Log Service"
 * action and Work Order completion. It:
 *   1. snapshots the program/task names,
 *   2. writes the serviceHistory record,
 *   3. updates the asset's last-service + current meter (and writes a
 *      meterReadings row) so due-status recomputes from the new baseline.
 */
import { ObjectId } from 'mongodb';
import {
  getServiceHistoryCollection,
  getServiceProgramsCollection,
  getServiceTasksCollection,
  getAssetsCollection,
  getMeterReadingsCollection,
  getUsersCollection,
} from '@/lib/mongodb';
import type { LogServiceInput, ServiceMeterType } from './types';

function toOidArray(ids: string[] | undefined): ObjectId[] {
  return (ids || []).filter((id) => ObjectId.isValid(id)).map((id) => ObjectId.createFromHexString(id));
}

function serializeEntry(doc: Record<string, unknown>) {
  return {
    id: (doc._id as ObjectId).toString(),
    assetId: doc.assetId ? (doc.assetId as ObjectId).toString() : null,
    workOrderId: doc.workOrderId ? (doc.workOrderId as ObjectId).toString() : null,
    programNames: (doc.programNames as string[]) ?? [],
    taskNames: (doc.taskNames as string[]) ?? [],
    performedAt: doc.performedAt ? new Date(doc.performedAt as Date).toISOString() : null,
    meterType: (doc.meterType as string) ?? null,
    meterAtService: (doc.meterAtService as number) ?? null,
    totalCost: (doc.totalCost as number) ?? null,
    notes: (doc.notes as string) ?? null,
    performedByName: (doc.performedByName as string) ?? null,
    source: (doc.source as string) ?? 'manual',
  };
}

/**
 * Record a completed service for an asset. Returns the serialized entry, or
 * `{ error }` when the asset is invalid.
 */
export async function logServiceEntry(
  tenantId: string,
  userId: string,
  input: LogServiceInput,
  opts: { source?: 'manual' | 'work_order'; performedById?: string } = {},
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  if (!input.assetId || !ObjectId.isValid(input.assetId)) {
    return { data: null, error: 'Valid asset is required' };
  }

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const assetOid = ObjectId.createFromHexString(input.assetId);
  const now = new Date();
  const performedAt = input.performedAt ? new Date(input.performedAt) : now;

  const assetsCol = await getAssetsCollection();
  const asset = await assetsCol.findOne({ _id: assetOid, tenantId: tenantOid });
  if (!asset) return { data: null, error: 'Asset not found' };

  const programOids = toOidArray(input.servicePrograms);
  const taskOids = toOidArray(input.serviceTaskIds);

  // Snapshot program + task names so history is stable.
  const [programDocs, taskDocs] = await Promise.all([
    programOids.length
      ? (await getServiceProgramsCollection()).find({ _id: { $in: programOids }, tenantId: tenantOid }).toArray()
      : Promise.resolve([]),
    taskOids.length
      ? (await getServiceTasksCollection()).find({ _id: { $in: taskOids }, tenantId: tenantOid }).toArray()
      : Promise.resolve([]),
  ]);
  const programNames = programDocs.map((p) => (p.title as string) || '');
  const taskNames = taskDocs.map((t) => (t.title as string) || '');

  // Resolve performer name.
  const performerOid =
    opts.performedById && ObjectId.isValid(opts.performedById)
      ? ObjectId.createFromHexString(opts.performedById)
      : ObjectId.createFromHexString(userId);
  let performedByName: string | null = null;
  const performer = await (await getUsersCollection()).findOne({ _id: performerOid });
  if (performer) {
    performedByName =
      (performer.name as string) ||
      `${(performer.firstName as string) || ''} ${(performer.lastName as string) || ''}`.trim() ||
      (performer.email as string) ||
      null;
  }

  // Meter type: explicit → asset primary → odometer.
  const validMeterTypes: ServiceMeterType[] = ['odometer', 'engine_hours'];
  const meterType: ServiceMeterType =
    input.meterType && validMeterTypes.includes(input.meterType as ServiceMeterType)
      ? (input.meterType as ServiceMeterType)
      : validMeterTypes.includes(asset.primaryMeter as ServiceMeterType)
        ? (asset.primaryMeter as ServiceMeterType)
        : 'odometer';

  const meterAtService =
    typeof input.meterAtService === 'number' && input.meterAtService >= 0 ? input.meterAtService : null;

  // 1) Write the history entry.
  const historyCol = await getServiceHistoryCollection();
  const doc = {
    tenantId: tenantOid,
    assetId: assetOid,
    workOrderId: input.workOrderId && ObjectId.isValid(input.workOrderId) ? ObjectId.createFromHexString(input.workOrderId) : null,
    servicePrograms: programOids,
    programNames,
    serviceTaskIds: taskOids,
    taskNames,
    performedAt,
    meterType: meterAtService != null ? meterType : null,
    meterAtService,
    totalCost: typeof input.totalCost === 'number' ? input.totalCost : null,
    notes: input.notes?.trim() || null,
    performedById: performerOid,
    performedByName,
    source: opts.source || 'manual',
    createdAt: now,
  };
  const result = await historyCol.insertOne(doc);

  // 2) Update the asset's last-service + current meter (resets the schedule).
  const assetSet: Record<string, unknown> = { lastServiceDate: performedAt, updatedAt: now };
  if (meterAtService != null) {
    if (meterType === 'engine_hours') {
      assetSet.lastServiceEngineHours = meterAtService;
      if (meterAtService > ((asset.currentEngineHours as number) || 0)) assetSet.currentEngineHours = meterAtService;
    } else {
      assetSet.lastServiceMileage = meterAtService;
      if (meterAtService > ((asset.currentOdometer as number) || 0)) assetSet.currentOdometer = meterAtService;
    }
  }
  await assetsCol.updateOne({ _id: assetOid, tenantId: tenantOid }, { $set: assetSet });

  // 3) Write a meter reading row for history/traceability.
  if (meterAtService != null) {
    const metersCol = await getMeterReadingsCollection();
    await metersCol.insertOne({
      tenantId: tenantOid,
      assetId: assetOid,
      meterType,
      value: meterAtService,
      readingAt: performedAt,
      source: 'service',
      createdBy: performerOid,
      createdAt: now,
    });
  }

  return { data: serializeEntry({ ...doc, _id: result.insertedId }), error: null };
}

/** Recent service history for an asset (newest first). */
export async function listServiceHistory(
  tenantId: string,
  assetId: string,
  options: { limit?: number } = {},
) {
  if (!ObjectId.isValid(assetId)) return { items: [] };
  const col = await getServiceHistoryCollection();
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const items = await col
    .find({ tenantId: ObjectId.createFromHexString(tenantId), assetId: ObjectId.createFromHexString(assetId) })
    .sort({ performedAt: -1 })
    .limit(limit)
    .toArray();
  return { items: items.map((d) => serializeEntry(d as Record<string, unknown>)) };
}
