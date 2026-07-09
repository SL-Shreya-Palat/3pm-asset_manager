/**
 * GET /api/fuel/analytics -- Get fuel analytics/trends/summary
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getFuelAnalytics } from '@/controller/fuel';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, 'fuel.fuel.fuelEntry', 'view');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const { searchParams } = request.nextUrl;
  const assetId = searchParams.get('assetId') || undefined;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  const result = await getFuelAnalytics(user.currentTenantId!, {
    assetId,
    startDate,
    endDate,
  });

  return NextResponse.json({ data: result, error: null });
}
