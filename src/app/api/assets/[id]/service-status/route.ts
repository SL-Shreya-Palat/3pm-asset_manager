/**
 * GET /api/assets/:id/service-status
 * Returns the asset's service programs with computed due-status + recent history.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { authorize, inTeamScope } from '@/lib/authz';
import { getAssetsCollection } from '@/lib/mongodb';
import { getAssetServiceStatus } from '@/controller/service-plans';
import { listServiceHistory } from '@/controller/service-history';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, 'assets.assets.asset', 'view');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  const { id } = await context.params;

  if (scope === 'OWN' || teamIds) {
    const collection = await getAssetsCollection();
    const asset = ObjectId.isValid(id)
      ? await collection.findOne(
          { _id: ObjectId.createFromHexString(id), tenantId: ObjectId.createFromHexString(user.currentTenantId!) },
          { projection: { teamIds: 1, createdBy: 1 } },
        )
      : null;
    if (
      !asset ||
      (scope === 'OWN' && asset.createdBy?.toString() !== user.id) ||
      !inTeamScope(teamIds, asset.teamIds)
    ) {
      return NextResponse.json({ data: null, error: 'Asset not found' }, { status: 404 });
    }
  }

  const [status, history] = await Promise.all([
    getAssetServiceStatus(user.currentTenantId!, id),
    listServiceHistory(user.currentTenantId!, id, { limit: 25 }),
  ]);

  // Rollup summary across the plan's schedules.
  const summary = { overdue: 0, due: 0, upcoming: 0, planned: 0 };
  for (const s of status.perSchedule) {
    if (s.status === 'overdue') summary.overdue++;
    else if (s.status === 'due') summary.due++;
    else if (s.status === 'upcoming') summary.upcoming++;
    else if (s.status === 'planned') summary.planned++;
  }

  return NextResponse.json({
    data: {
      planId: status.planId,
      planName: status.planName,
      schedules: status.perSchedule,
      mostUrgent: status.mostUrgent,
      summary,
      history: history.items,
    },
    error: null,
  });
}
