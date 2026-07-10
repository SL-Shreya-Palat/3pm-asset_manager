/**
 * PUT /api/work-orders/:id/status -- Transition work order status
 * Body: { statusId: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize, inTeamScope } from '@/lib/authz';
import { getWorkOrderById, transitionWorkOrderStatus } from '@/controller/work-orders';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, 'maintenance.workOrders.workOrder', 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  try {
    const { id } = await context.params;

    if (scope === 'OWN' || teamIds) {
      const existing = await getWorkOrderById(user.currentTenantId!, id);
      if (
        !existing ||
        (scope === 'OWN' && existing.createdBy !== user.id) ||
        !inTeamScope(teamIds, existing.teamIds)
      ) {
        return NextResponse.json({ data: null, error: 'Work order not found' }, { status: 404 });
      }
    }

    const body = await request.json();
    const { statusId } = body;

    if (!statusId || typeof statusId !== 'string') {
      return NextResponse.json({ data: null, error: 'Status ID is required' }, { status: 400 });
    }

    const result = await transitionWorkOrderStatus(
      user.currentTenantId!,
      user.id,
      id,
      statusId,
    );

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
