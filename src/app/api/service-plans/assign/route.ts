/**
 * POST /api/service-plans/assign -- { planId: string|null, assetIds: string[] }
 * Sets asset.servicePlanId for the given assets (null clears the plan).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { assignPlanToAssets } from '@/controller/service-plans';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { planId?: string | null; assetIds?: unknown };
    const assetIds = Array.isArray(body.assetIds) ? body.assetIds.map(String) : [];
    if (!assetIds.length) {
      return NextResponse.json({ data: null, error: 'assetIds are required' }, { status: 400 });
    }
    const result = await assignPlanToAssets(
      user.currentTenantId,
      user.id,
      body.planId ?? null,
      assetIds,
    );
    return NextResponse.json({ data: result, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
