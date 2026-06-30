/**
 * PUT /api/work-orders/:id/status -- Transition work order status
 * Body: { statusId: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { transitionWorkOrderStatus } from '@/controller/work-orders';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { statusId } = body;

    if (!statusId || typeof statusId !== 'string') {
      return NextResponse.json({ data: null, error: 'Status ID is required' }, { status: 400 });
    }

    const result = await transitionWorkOrderStatus(
      user.currentTenantId,
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
