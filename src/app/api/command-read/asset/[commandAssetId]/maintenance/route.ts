/**
 * GET /api/command-read/asset/[commandAssetId]/maintenance
 *
 * Reverse read-through for Command (construction-portal). Returns Asset Manager's
 * maintenance data for a Command-linked asset — service status + history, work
 * orders, and pre-start submissions — so Command can DISPLAY them on its asset
 * detail for a tenant it manages.
 *
 * Auth: a Command SERVICE call (X-Client-Id/X-Client-Secret + X-Tenant-Id — see
 * the Command service branch in lib/auth-helper.ts). The asset is addressed by
 * its Command id (`commandAssetId`); we resolve the local AM asset from it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getAssetsCollection } from '@/lib/mongodb';
import { getAssetServiceStatus } from '@/controller/service-plans';
import { listServiceHistory } from '@/controller/service-history';
import { listInspectionSubmissions } from '@/controller/inspection-submissions';
import { getAllWorkOrders } from '@/controller/work-orders';
import { getAllDefects } from '@/controller/defects';

type RouteContext = { params: Promise<{ commandAssetId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { commandAssetId } = await context.params;
  if (!commandAssetId) {
    return NextResponse.json({ data: null, error: 'Missing commandAssetId' }, { status: 400 });
  }

  // Resolve the local AM asset from its Command id (stored as a string).
  const assets = await getAssetsCollection();
  const asset = await assets.findOne(
    {
      tenantId: ObjectId.createFromHexString(user.currentTenantId),
      commandAssetId,
      source: 'command',
    },
    { projection: { _id: 1, status: 1 } },
  );
  if (!asset) {
    return NextResponse.json(
      { data: null, error: 'Asset not found in Asset Manager' },
      { status: 404 },
    );
  }

  const tenantId = user.currentTenantId;
  const assetId = asset._id.toString();

  const [status, history, prestarts, workOrders, issues] = await Promise.all([
    getAssetServiceStatus(tenantId, assetId),
    listServiceHistory(tenantId, assetId, { limit: 50 }),
    listInspectionSubmissions(tenantId, { assetId, limit: 50 }),
    getAllWorkOrders(tenantId, { assetId, limit: 50 }),
    // Faults AND defects live in one AM collection; `source:'fault'` = a manual
    // fault, everything else = a defect (mostly pre-start raised). Command shows
    // them TOGETHER under "Faults" with a per-type breakdown, so return the
    // combined list normalized to one shape carrying its `type`.
    getAllDefects(tenantId, { assetId, limit: 200 }),
  ]);

  const faults = (issues.items as Array<Record<string, unknown>>).map((d) => ({
    id: d.id as string,
    type: d.source === 'fault' ? 'fault' : 'defect',
    number: (d.defectNumber as string) ?? null,
    title: (d.name as string) ?? null,
    description: (d.comment as string) ?? null,
    priority: (d.priority as string) ?? null,
    severity: (d.severity as string) ?? null,
    status: (d.status as string) ?? null,
    reportedAt: (d.date as string) ?? (d.createdAt as string) ?? null,
    workOrderNumber: (d.workOrderNumber as string) ?? null,
  }));

  // Rollup across the plan's schedules (same shape as /api/assets/[id]/service-status).
  const summary = { overdue: 0, due: 0, upcoming: 0, planned: 0 };
  for (const s of status.perSchedule) {
    if (s.status === 'overdue') summary.overdue++;
    else if (s.status === 'due') summary.due++;
    else if (s.status === 'upcoming') summary.upcoming++;
    else if (s.status === 'planned') summary.planned++;
  }

  // Authoritative availability — AM owns the asset's out-of-service state for a
  // managed tenant (a failed pre-start grounds it here). Command reconciles its
  // own `outOfService` flag from this so the two stay consistent even if a live
  // write-back was ever missed.
  const assetStatus = (asset as { status?: string }).status ?? null;

  return NextResponse.json({
    data: {
      availability: {
        outOfService: assetStatus === 'out_of_service',
        status: assetStatus,
      },
      serviceStatus: {
        planId: status.planId,
        planName: status.planName,
        schedules: status.perSchedule,
        mostUrgent: status.mostUrgent,
        summary,
      },
      serviceHistory: history.items,
      prestarts: prestarts.items,
      workOrders: workOrders.items,
      faults,
    },
    error: null,
  });
}
