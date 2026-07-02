/**
 * GET /api/driver-wellness/:id -- Get a single wellness check
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getWellnessCheckById } from '@/controller/driver-wellness';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const check = await getWellnessCheckById(user.currentTenantId, id);

  if (!check) {
    return NextResponse.json({ data: null, error: 'Wellness check not found' }, { status: 404 });
  }

  return NextResponse.json({ data: check, error: null });
}
