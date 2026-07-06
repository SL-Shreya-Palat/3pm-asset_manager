/**
 * GET /api/assets/summary — headline asset counts for the stat ribbon.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getAssetSummary } from '@/controller/assets';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await getAssetSummary(user.currentTenantId);
  return NextResponse.json({ data: result, error: null });
}
