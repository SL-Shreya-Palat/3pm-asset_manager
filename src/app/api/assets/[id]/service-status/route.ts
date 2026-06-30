/**
 * GET /api/assets/:id/service-status
 * Returns the asset's service programs with computed due-status + recent history.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getAssetServiceStatus } from '@/controller/service-programs/due-status';
import { listServiceHistory } from '@/controller/service-history';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const [status, history] = await Promise.all([
    getAssetServiceStatus(user.currentTenantId, id),
    listServiceHistory(user.currentTenantId, id, { limit: 25 }),
  ]);

  return NextResponse.json({
    data: { programs: status.items, summary: status.summary, history: history.items },
    error: null,
  });
}
