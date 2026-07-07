/**
 * GET    /api/work-orders/:id -- Get a single work order
 * PUT    /api/work-orders/:id -- Update a work order
 * DELETE /api/work-orders/:id -- Archive a work order
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  getWorkOrderById,
  updateWorkOrder,
  deleteWorkOrder,
} from '@/controller/work-orders';
import { getFormPermissionLevels } from '@/lib/server-permissions';

const FORM_ID = 'maintenance.workOrders.workOrder';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const wo = await getWorkOrderById(user.currentTenantId, id);
  if (!wo) {
    return NextResponse.json({ data: null, error: 'Work order not found' }, { status: 404 });
  }

  // "OWN" view: block access to records the user didn't create
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.view === 'OWN' && wo.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Work order not found' }, { status: 404 });
  }

  return NextResponse.json({ data: wo, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    // "OWN" edit: verify the user created this work order
    const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
    if (perms.edit === 'OWN') {
      const existing = await getWorkOrderById(user.currentTenantId, id);
      if (!existing) {
        return NextResponse.json({ data: null, error: 'Work order not found' }, { status: 404 });
      }
      if (existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit work orders you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updateWorkOrder(user.currentTenantId, user.id, id, body);

    if (result.error) {
      const status = result.error === 'Work order not found' ? 404 : 400;
      return NextResponse.json({ data: null, error: result.error }, { status });
    }

    return NextResponse.json({ data: result.data, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  // "OWN" delete: verify the user created this work order
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.delete === 'OWN') {
    const existing = await getWorkOrderById(user.currentTenantId, id);
    if (!existing) {
      return NextResponse.json({ data: null, error: 'Work order not found' }, { status: 404 });
    }
    if (existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete work orders you created' }, { status: 403 });
    }
  }

  const deleted = await deleteWorkOrder(user.currentTenantId, user.id, id);
  if (!deleted) {
    return NextResponse.json(
      { data: null, error: 'Work order not found' },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: { success: true }, error: null });
}
