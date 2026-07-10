/**
 * GET    /api/purchase-orders/:id -- Get a single purchase order
 * PUT    /api/purchase-orders/:id -- Update a purchase order
 * DELETE /api/purchase-orders/:id -- Archive a purchase order (draft only)
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
} from '@/controller/purchase-orders';
import { authorize } from '@/lib/authz';

const FORM_ID = 'maintenance.purchaseOrders.purchaseOrder';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { id } = await context.params;
  const po = await getPurchaseOrderById(user.currentTenantId!, id);
  if (!po) {
    return NextResponse.json({ data: null, error: 'Purchase order not found' }, { status: 404 });
  }
  if (scope === 'OWN' && po.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Purchase order not found' }, { status: 404 });
  }

  return NextResponse.json({ data: po, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  try {
    const { id } = await context.params;

    // "OWN" edit: verify the user created this purchase order
    if (scope === 'OWN') {
      const existing = await getPurchaseOrderById(user.currentTenantId!, id);
      if (!existing || existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit purchase orders you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updatePurchaseOrder(user.currentTenantId!, user.id, id, body);

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
  const auth = await authorize(request, FORM_ID, 'delete');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { id } = await context.params;

  // "OWN" delete: verify the user created this purchase order
  if (scope === 'OWN') {
    const existing = await getPurchaseOrderById(user.currentTenantId!, id);
    if (!existing || existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete purchase orders you created' }, { status: 403 });
    }
  }

  const result = await deletePurchaseOrder(user.currentTenantId!, user.id, id);
  if (!result.deleted) {
    const status = result.error === 'Purchase order not found' ? 404 : 400;
    return NextResponse.json({ data: null, error: result.error }, { status });
  }
  return NextResponse.json({ data: { success: true }, error: null });
}
