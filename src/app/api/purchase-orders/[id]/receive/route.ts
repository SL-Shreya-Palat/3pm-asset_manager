/**
 * POST /api/purchase-orders/:id/receive -- Receive items into stock.
 * Body: { receipts: Array<{ index: number; quantity: number }> }
 *
 * Credits the newly-received quantities to the PO's delivery location and moves
 * the PO to received / received_partial. Safe to call repeatedly until complete.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { receivePurchaseOrder } from '@/controller/purchase-orders';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, 'maintenance.purchaseOrders.purchaseOrder', 'edit');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const receipts = Array.isArray(body?.receipts) ? body.receipts : [];

    const result = await receivePurchaseOrder(user.currentTenantId!, user.id, id, receipts);

    if (result.error) {
      const status = result.error === 'Purchase order not found' ? 404 : 400;
      return NextResponse.json({ data: null, error: result.error }, { status });
    }

    return NextResponse.json({ data: result.data, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
