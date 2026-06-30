/**
 * PUT /api/notifications/read -- Mark notifications read.
 * Body: { ids?: string[], all?: boolean }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { markNotificationsRead } from '@/controller/notifications';

export async function PUT(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const modified = await markNotificationsRead(user.currentTenantId, user.id, {
      ids: Array.isArray(body.ids) ? body.ids : undefined,
      all: body.all === true,
    });
    return NextResponse.json({ data: { modified }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
