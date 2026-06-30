/**
 * POST   /api/teams/:id/assets — Bulk-add assets to a team
 * DELETE /api/teams/:id/assets — Remove an asset from a team
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { addTeamToAssets, removeTeamFromAsset } from '@/controller/assets';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id: teamId } = await context.params;
    const body = await request.json();
    const assetIds: string[] = body.assetIds;

    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json({ data: null, error: 'assetIds is required' }, { status: 400 });
    }

    const count = await addTeamToAssets(user.currentTenantId, user.id, teamId, assetIds);
    return NextResponse.json({ data: { modified: count }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id: teamId } = await context.params;
    const { searchParams } = request.nextUrl;
    const assetId = searchParams.get('assetId');

    if (!assetId) {
      return NextResponse.json({ data: null, error: 'assetId query param is required' }, { status: 400 });
    }

    const removed = await removeTeamFromAsset(user.currentTenantId, user.id, teamId, assetId);
    if (!removed) {
      return NextResponse.json({ data: null, error: 'Asset not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request' }, { status: 400 });
  }
}
