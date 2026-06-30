/**
 * PUT /api/purchase-orders/:id/status -- Transition PO status
 * Body: { status: string; note?: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { transitionPurchaseOrderStatus } from '@/controller/purchase-orders';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { status, note } = body;

    if (!status || typeof status !== 'string') {
      return NextResponse.json({ data: null, error: 'Status is required' }, { status: 400 });
    }

    const result = await transitionPurchaseOrderStatus(
      user.currentTenantId,
      user.id,
      id,
      status,
      note,
    );

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
