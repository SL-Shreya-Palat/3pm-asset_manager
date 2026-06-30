/**
 * GET /api/notifications -- Recent notifications + unread count for the current user.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { listNotifications } from '@/controller/notifications';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);
  const result = await listNotifications(user.currentTenantId, user.id, { limit });
  return NextResponse.json({ data: result, error: null });
}
