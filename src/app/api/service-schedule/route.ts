/**
 * GET /api/service-schedule -- Computed service schedule view (read-only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getServiceSchedule } from '@/controller/service-schedule';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, 'maintenance.serviceSchedule.serviceSchedule', 'view');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const search = searchParams.get('search') || undefined;

  const result = await getServiceSchedule(user.currentTenantId, { page, limit, search });
  return NextResponse.json({ data: result, error: null });
}
