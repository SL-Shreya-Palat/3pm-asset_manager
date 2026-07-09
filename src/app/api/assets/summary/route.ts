/**
 * GET /api/assets/summary — headline asset counts for the stat ribbon.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getAssetSummary } from '@/controller/assets';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, 'assets.assets.asset', 'view');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const result = await getAssetSummary(user.currentTenantId!);
  return NextResponse.json({ data: result, error: null });
}
