/**
 * GET    /api/assets/:id — Get a single asset
 * PUT    /api/assets/:id — Update an asset
 * DELETE /api/assets/:id — Archive an asset
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getAssetById, updateAsset, deleteAsset } from '@/controller/assets';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const asset = await getAssetById(user.currentTenantId, id, user.id);

  if (!asset) {
    return NextResponse.json({ data: null, error: 'Asset not found' }, { status: 404 });
  }

  return NextResponse.json({ data: asset, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await updateAsset(user.currentTenantId, user.id, id, body);

    if (result.error) {
      const status = result.error === 'Asset not found' ? 404 : 400;
      return NextResponse.json({ data: null, error: result.error }, { status });
    }

    return NextResponse.json({ data: result.data, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const deleted = await deleteAsset(user.currentTenantId, user.id, id);

  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Asset not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
