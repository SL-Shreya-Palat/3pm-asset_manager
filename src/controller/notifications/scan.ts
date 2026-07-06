/**
 * Periodic notification scan (for time-based alerts that have no natural event).
 *
 * Runs from the cron endpoint (/api/cron/notifications) on a schedule you control.
 * It's fully additive: it only READS existing data and creates notifications via the
 * deduped helpers, so re-running it (e.g. daily) never spams — a recipient gets at
 * most one alert per (type, entity) per ~20h window until the situation is resolved.
 *
 *   • Service due / overdue    → tenant managers + the asset's assigned driver
 *   • Work order overdue       → tenant managers + the assigned mechanic
 *   • Part low / out of stock  → tenant managers (parts at/below their reorder point)
 *   • Compliance doc expiring  → tenant managers + the asset's assigned driver
 *                                (rego / WOF / CoF / RUC / insurance in `documents`)
 */
import { ObjectId } from 'mongodb';
import {
  getTenantsCollection,
  getServiceProgramsCollection,
  getAssetsCollection,
  getDriversCollection,
  getTenantMembersCollection,
  getWorkOrdersCollection,
  getPartsCollection,
} from '@/lib/mongodb';
import { getAssetServiceStatus } from '@/controller/service-programs/due-status';
import { listExpiring } from '@/controller/documents';
import { DOCUMENT_TYPE_LABELS } from '@/constants/documents';
import { notifyTenantManagersOnce, notifyUsersOnce, notifyEventOnce } from '@/controller/notifications';

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
      { projection: { name: 1, assignedDriverId: 1, teamIds: 1 } },
    );
    const assetName = (asset?.name as string) || 'An asset';
    const teamIds = (asset?.teamIds as ObjectId[]) ?? [];
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
      await notifyEventOnce(tenantId, payload, { teamIds });
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

/** Parts at or below their reorder point for one tenant. Managers get one alert
 *  per part per dedupe window until the part is restocked above its reorder point. */
async function scanLowStock(tenantId: string): Promise<number> {
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const partsCol = await getPartsCollection();
  // Only parts with a meaningful reorder point can go "low".
  const parts = await partsCol
    .find(
      { tenantId: tenantOid, isArchived: { $ne: true }, reorderPoint: { $gt: 0 } },
      { projection: { name: 1, partNumber: 1, reorderPoint: 1, stockLocations: 1 } },
    )
    .toArray();

  let count = 0;
  for (const p of parts) {
    const reorder = p.reorderPoint as number;
    const total = ((p.stockLocations as Array<{ quantity: number }> | undefined) || [])
      .reduce((sum, l) => sum + (l.quantity || 0), 0);
    if (total > reorder) continue; // healthy stock

    const outOfStock = total <= 0;
    const partName = (p.name as string) || 'A part';
    const suffix = p.partNumber ? ` (${p.partNumber as string})` : '';
    const payload = {
      type: outOfStock ? ('part_out_of_stock' as const) : ('part_low_stock' as const),
      title: `${outOfStock ? 'Out of stock' : 'Low stock'}: ${partName}`,
      body: `${partName}${suffix} — ${total} in stock (reorder point ${reorder}).`,
      link: '/maintenance/inventory',
      entityType: 'part',
      entityId: (p._id as ObjectId).toString(),
    };
    // Parts have no team → routes to all managers by default (admin can turn off).
    await notifyEventOnce(tenantId, payload);
    count++;
  }
  return count;
}

/** Compliance documents (rego / WOF / CoF / RUC / insurance…) that are expired or
 *  within their reminder window, for one tenant. Managers (+ the asset's assigned
 *  driver) get one alert per document per dedupe window until it's renewed. */
async function scanComplianceExpiry(tenantId: string): Promise<number> {
  const { items } = await listExpiring(tenantId);
  if (items.length === 0) return 0;

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const assetsCol = await getAssetsCollection();

  // Bulk-resolve asset names + assigned drivers for the asset-scoped docs.
  const assetIds = [
    ...new Set(items.filter((d) => d.scope === 'asset' && d.assetId).map((d) => d.assetId as string)),
  ];
  const assetMap = new Map<string, { name: string; assignedDriverId?: ObjectId; teamIds: ObjectId[] }>();
  if (assetIds.length) {
    const assets = await assetsCol
      .find(
        { _id: { $in: assetIds.map((id) => ObjectId.createFromHexString(id)) }, tenantId: tenantOid },
        { projection: { name: 1, assignedDriverId: 1, teamIds: 1 } },
      )
      .toArray();
    for (const a of assets) {
      assetMap.set((a._id as ObjectId).toString(), {
        name: (a.name as string) || 'An asset',
        assignedDriverId: a.assignedDriverId as ObjectId | undefined,
        teamIds: (a.teamIds as ObjectId[]) ?? [],
      });
    }
  }

  let count = 0;
  for (const doc of items) {
    const label = DOCUMENT_TYPE_LABELS[doc.docType] || doc.title;
    const expired = doc.status === 'expired';
    const asset = doc.assetId ? assetMap.get(doc.assetId) : undefined;
    const ownerName = asset?.name || 'A record';
    const days = doc.daysUntilExpiry ?? 0;
    const when = expired
      ? `expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
      : days === 0
        ? 'expires today'
        : `expires in ${days} day${days === 1 ? '' : 's'}`;

    const payload = {
      type: expired ? ('document_expired' as const) : ('document_expiring' as const),
      title: `${expired ? 'Compliance expired' : 'Compliance expiring'}: ${label}`,
      body: `${ownerName} — ${label} ${when}.`,
      link: doc.scope === 'asset' && doc.assetId ? `/assets/${doc.assetId}` : '/assets',
      entityType: 'document',
      entityId: doc.id,
    };
    await notifyEventOnce(tenantId, payload, { teamIds: asset?.teamIds ?? [] });
    if (asset?.assignedDriverId) {
      const driverUserIds = await resolveDriverUserIds(tenantOid, asset.assignedDriverId);
      if (driverUserIds.length) await notifyUsersOnce(tenantId, driverUserIds, payload);
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
  lowStockAlerts: number;
  complianceAlerts: number;
}> {
  const tenantsCol = await getTenantsCollection();
  const tenants = await tenantsCol
    .find({ isActive: { $ne: false } }, { projection: { _id: 1 } })
    .toArray();

  let serviceAlerts = 0;
  let workOrderAlerts = 0;
  let lowStockAlerts = 0;
  let complianceAlerts = 0;

  for (const t of tenants) {
    const tenantId = (t._id as ObjectId).toString();
    try {
      serviceAlerts += await scanServiceDue(tenantId);
      workOrderAlerts += await scanWorkOrdersOverdue(tenantId);
      lowStockAlerts += await scanLowStock(tenantId);
      complianceAlerts += await scanComplianceExpiry(tenantId);
    } catch (err) {
      // One tenant's failure must not stop the rest.
      console.error(`[notifications] scan failed for tenant ${tenantId}:`, err);
    }
  }

  return { tenants: tenants.length, serviceAlerts, workOrderAlerts, lowStockAlerts, complianceAlerts };
}
