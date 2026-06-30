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
  return NextResponse.json({ data: po, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
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
  const deleted = await deletePurchaseOrder(user.currentTenantId, user.id, id);
  if (!deleted) {
    return NextResponse.json(
      { data: null, error: 'Purchase order not found or cannot be deleted' },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: { success: true }, error: null });
}
