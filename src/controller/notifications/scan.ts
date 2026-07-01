/**
 * Periodic notification scan (for time-based alerts that have no natural event).
 *
 * Runs from the cron endpoint (/api/cron/notifications) on a schedule you control.
 * It's fully additive: it only READS existing data and creates notifications via the
 * deduped helpers, so re-running it (e.g. daily) never spams — a recipient gets at
 * most one alert per (type, entity) per ~20h window until the situation is resolved.
 *
 *   • Service due / overdue  → tenant managers + the asset's assigned driver
 *   • Work order overdue     → tenant managers + the assigned mechanic
 *
 * (Asset compliance expiry is intentionally NOT here — this app's asset model has no
 *  rego / WOF / CoF expiry fields yet; add those fields first, then a branch here.)
 */
import { ObjectId } from 'mongodb';
import {
  getTenantsCollection,
  getServiceProgramsCollection,
  getAssetsCollection,
  getDriversCollection,
  getTenantMembersCollection,
  getWorkOrdersCollection,
} from '@/lib/mongodb';
import { getAssetServiceStatus } from '@/controller/service-programs/due-status';
import { notifyTenantManagersOnce, notifyUsersOnce } from '@/controller/notifications';

/** Resolve the asset's assigned driver to a portal user id (if the driver is a member). */
async function resolveDriverUserIds(
  tenantOid: ObjectId,
  assignedDriverId: ObjectId | undefined,
): Promise<ObjectId[]> {
  if (!assignedDriverId) return [];
  const driversCol = await getDriversCollection();
  const driver = await driversCol.findOne(
    { _id: assignedDriverId, tenantId: tenantOid },
    { projection: { tenantMemberId: 1 } },
  );
  if (!driver?.tenantMemberId) return [];
  const membersCol = await getTenantMembersCollection();
  const member = await membersCol.findOne(
    { _id: driver.tenantMemberId as ObjectId, tenantId: tenantOid },
    { projection: { userId: 1 } },
  );
  return member?.userId ? [member.userId as ObjectId] : [];
}

/** Service due / overdue alerts for one tenant. Returns the number of alerts raised. */
async function scanServiceDue(tenantId: string): Promise<number> {
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const programsCol = await getServiceProgramsCollection();
  const programs = await programsCol
    .find({ tenantId: tenantOid, isArchived: { $ne: true } }, { projection: { assetIds: 1 } })
    .toArray();

  // Unique set of assets that have at least one program assigned.
  const assetIds = new Map<string, ObjectId>();
  for (const p of programs) {
    for (const a of ((p.assetIds as ObjectId[] | undefined) ?? [])) assetIds.set(a.toString(), a);
  }
  if (assetIds.size === 0) return 0;

  const assetsCol = await getAssetsCollection();
  let count = 0;

  for (const assetOid of assetIds.values()) {
    const status = await getAssetServiceStatus(tenantId, assetOid.toString());
    const due = status.items.filter((i) => i.status === 'overdue' || i.status === 'due_soon');
    if (due.length === 0) continue;

    const asset = await assetsCol.findOne(
      { _id: assetOid, tenantId: tenantOid },
      { projection: { name: 1, assignedDriverId: 1 } },
    );
    const assetName = (asset?.name as string) || 'An asset';
    const driverUserIds = await resolveDriverUserIds(tenantOid, asset?.assignedDriverId as ObjectId | undefined);

    for (const item of due) {
      const overdue = item.status === 'overdue';
      const payload = {
        type: overdue ? ('service_overdue' as const) : ('service_due' as const),
        title: `${overdue ? 'Service overdue' : 'Service due soon'}: ${item.title}`,
        body: `${assetName} — "${item.title}" is ${overdue ? 'overdue' : 'due soon'}.`,
        link: `/assets/${assetOid.toString()}`,
        entityType: 'serviceProgram',
        entityId: item.programId,
      };
      await notifyTenantManagersOnce(tenantId, payload);
      if (driverUserIds.length) await notifyUsersOnce(tenantId, driverUserIds, payload);
      count++;
    }
  }
  return count;
}

/** Work orders past their due date (not completed) for one tenant. */
async function scanWorkOrdersOverdue(tenantId: string): Promise<number> {
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const col = await getWorkOrdersCollection();
  const overdue = await col
    .find(
      {
        tenantId: tenantOid,
        isArchived: { $ne: true },
        isCompleted: { $ne: true },
        dueDate: { $ne: null, $lt: new Date() },
      },
      { projection: { workOrderNumber: 1, assetName: 1, assigneeType: 1, assigneeId: 1 } },
    )
    .toArray();

  let count = 0;
  for (const wo of overdue) {
    const payload = {
      type: 'work_order_overdue' as const,
      title: `Work order ${(wo.workOrderNumber as string) || ''} overdue`,
      body: `${(wo.assetName as string) || 'Asset'} — work order is past its due date.`,
      link: '/maintenance/work-orders',
      entityType: 'workOrder',
      entityId: (wo._id as ObjectId).toString(),
    };
    await notifyTenantManagersOnce(tenantId, payload);
    if (wo.assigneeType === 'mechanic' && wo.assigneeId) {
      await notifyUsersOnce(tenantId, [wo.assigneeId as ObjectId], payload);
    }
    count++;
  }
  return count;
}

/** Scan every active tenant for time-based alerts. Safe to run repeatedly (deduped). */
export async function runNotificationScan(): Promise<{
  tenants: number;
  serviceAlerts: number;
  workOrderAlerts: number;
}> {
  const tenantsCol = await getTenantsCollection();
  const tenants = await tenantsCol
    .find({ isActive: { $ne: false } }, { projection: { _id: 1 } })
    .toArray();

  let serviceAlerts = 0;
  let workOrderAlerts = 0;

  for (const t of tenants) {
    const tenantId = (t._id as ObjectId).toString();
    try {
      serviceAlerts += await scanServiceDue(tenantId);
      workOrderAlerts += await scanWorkOrdersOverdue(tenantId);
    } catch (err) {
      // One tenant's failure must not stop the rest.
      console.error(`[notifications] scan failed for tenant ${tenantId}:`, err);
    }
  }

  return { tenants: tenants.length, serviceAlerts, workOrderAlerts };
}
