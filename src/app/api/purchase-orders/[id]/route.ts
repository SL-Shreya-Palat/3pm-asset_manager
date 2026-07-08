/**
 * GET    /api/purchase-orders/:id -- Get a single purchase order
 * PUT    /api/purchase-orders/:id -- Update a purchase order
 * DELETE /api/purchase-orders/:id -- Archive a purchase order (draft only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  getPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
} from '@/controller/purchase-orders';
import { getFormPermissionLevels } from '@/lib/server-permissions';

const FORM_ID = 'maintenance.purchaseOrders.purchaseOrder';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const po = await getPurchaseOrderById(user.currentTenantId, id);
  if (!po) {
    return NextResponse.json({ data: null, error: 'Purchase order not found' }, { status: 404 });
  }

  // "OWN" view: block access to records the user didn't create
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.view === 'OWN' && po.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Purchase order not found' }, { status: 404 });
  }

  return NextResponse.json({ data: po, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    // "OWN" edit: verify the user created this purchase order
    const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
    if (perms.edit === 'OWN') {
      const existing = await getPurchaseOrderById(user.currentTenantId, id);
      if (!existing) {
        return NextResponse.json({ data: null, error: 'Purchase order not found' }, { status: 404 });
      }
      if (existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit purchase orders you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updatePurchaseOrder(user.currentTenantId, user.id, id, body);

    if (result.error) {
      const status = result.error === 'Purchase order not found' ? 404 : 400;
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

  // "OWN" delete: verify the user created this purchase order
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.delete === 'OWN') {
    const existing = await getPurchaseOrderById(user.currentTenantId, id);
    if (!existing) {
      return NextResponse.json({ data: null, error: 'Purchase order not found' }, { status: 404 });
    }
    if (existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete purchase orders you created' }, { status: 403 });
    }
  }

  const deleted = await deletePurchaseOrder(user.currentTenantId, user.id, id);
  if (!deleted) {
    return NextResponse.json(
      { data: null, error: 'Purchase order not found or cannot be deleted' },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: { success: true }, error: null });
}
