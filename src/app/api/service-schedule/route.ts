/**
 * GET /api/service-schedule -- Computed service schedule view (read-only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getServiceSchedule } from '@/controller/service-schedule';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const search = searchParams.get('search') || undefined;

  const result = await getServiceSchedule(user.currentTenantId, { page, limit, search });
  return NextResponse.json({ data: result, error: null });
}
