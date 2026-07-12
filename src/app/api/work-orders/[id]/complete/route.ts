/**
 * PUT /api/work-orders/:id/complete -- Complete & sign off a work order.
 * Body: { servicePlanId?: string, servicePlanSchedule?: string, meterAtService?: number, meterType?: string, notes?: string }
 * Resolves linked defects, returns the asset to service, and logs a service
 * entry when scheduled work was fulfilled.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize, inTeamScope } from '@/lib/authz';
import { completeWorkOrder, getWorkOrderById } from '@/controller/work-orders';

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

    const body = await request.json().catch(() => ({}));
    const result = await completeWorkOrder(user.currentTenantId!, user.id, id, {
      servicePlanId: typeof body.servicePlanId === 'string' ? body.servicePlanId : undefined,
      servicePlanSchedule: typeof body.servicePlanSchedule === 'string' ? body.servicePlanSchedule : undefined,
      meterAtService: typeof body.meterAtService === 'number' ? body.meterAtService : undefined,
      meterType: typeof body.meterType === 'string' ? body.meterType : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    });

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result.data, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
