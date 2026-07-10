/**
 * GET    /api/work-orders/:id -- Get a single work order
 * PUT    /api/work-orders/:id -- Update a work order
 * DELETE /api/work-orders/:id -- Archive a work order
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getWorkOrderById,
  updateWorkOrder,
  deleteWorkOrder,
} from '@/controller/work-orders';
import { authorize, inTeamScope } from '@/lib/authz';

const FORM_ID = 'maintenance.workOrders.workOrder';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  const { id } = await context.params;
  const wo = await getWorkOrderById(user.currentTenantId!, id);
  if (!wo) {
    return NextResponse.json({ data: null, error: 'Work order not found' }, { status: 404 });
  }
  if ((scope === 'OWN' && wo.createdBy !== user.id) || !inTeamScope(teamIds, wo.teamIds)) {
    return NextResponse.json({ data: null, error: 'Work order not found' }, { status: 404 });
  }

  return NextResponse.json({ data: wo, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'edit');
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
    const result = await updateWorkOrder(user.currentTenantId!, user.id, id, body);

    if (result.error) {
      const status = result.error === 'Work order not found' ? 404 : 400;
      return NextResponse.json({ data: null, error: result.error }, { status });
    }

    return NextResponse.json({
      data: result.data,
      error: null,
      ...('warning' in result && result.warning ? { warning: result.warning } : {}),
    });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'delete');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

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

  const result = await deleteWorkOrder(user.currentTenantId!, user.id, id);
  if (!result.deleted) {
    const status = result.error === 'Work order not found' ? 404 : 400;
    return NextResponse.json({ data: null, error: result.error }, { status });
  }
  return NextResponse.json({ data: { success: true }, error: null });
}
