/**
 * GET /api/fuel/analytics -- Get fuel analytics/trends/summary
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getFuelAnalytics } from '@/controller/fuel';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const assetId = searchParams.get('assetId') || undefined;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  const result = await getFuelAnalytics(user.currentTenantId, {
    assetId,
    startDate,
    endDate,
  });

  return NextResponse.json({ data: result, error: null });
}
