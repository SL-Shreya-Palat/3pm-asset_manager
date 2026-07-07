/**
 * POST /api/drivers/:id/fitness
 *
 * Clears a driver's "unfit for duty" flag (manager override / mark fit).
 * Body: { status: 'fit' }.  The flag is otherwise cleared automatically on the
 * driver's next passing wellness check.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { clearDriverFitnessFlag } from '@/controller/drivers';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id || !user.currentTenantId) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: driverId } = await context.params;
    if (!ObjectId.isValid(driverId)) {
      return NextResponse.json({ data: null, error: 'Invalid driver ID' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    if (body?.status && body.status !== 'fit') {
      return NextResponse.json({ data: null, error: 'Only status "fit" is supported' }, { status: 400 });
    }

    const ok = await clearDriverFitnessFlag(user.currentTenantId, driverId, user.id);
    if (!ok) {
      return NextResponse.json({ data: null, error: 'Driver not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { status: 'fit' }, error: null });
  } catch (error) {
    console.error('[DRIVER_FITNESS_CLEAR]', error);
    return NextResponse.json({ data: null, error: 'Failed to update driver fitness' }, { status: 500 });
  }
}
