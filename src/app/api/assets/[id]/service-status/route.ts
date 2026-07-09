/**
 * GET /api/assets/:id/service-status
 * Returns the asset's service programs with computed due-status + recent history.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getAssetServiceStatus } from '@/controller/service-plans';
import { listServiceHistory } from '@/controller/service-history';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, 'assets.assets.asset', 'view');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const { id } = await context.params;
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
