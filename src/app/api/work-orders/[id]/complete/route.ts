/**
 * PUT /api/work-orders/:id/complete -- Complete & sign off a work order.
 * Body: { servicePrograms?: string[], meterAtService?: number, meterType?: string, notes?: string }
 * Resolves linked defects, returns the asset to service, and logs a service
 * entry when scheduled work was fulfilled.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { completeWorkOrder } from '@/controller/work-orders';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await completeWorkOrder(user.currentTenantId, user.id, id, {
      servicePrograms: Array.isArray(body.servicePrograms) ? body.servicePrograms : undefined,
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
