/**
 * GET /api/defects/summary — headline exception counts for the Exception Report.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getDefectSummary } from '@/controller/defects';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await getDefectSummary(user.currentTenantId);
  return NextResponse.json({ data: result, error: null });
}
