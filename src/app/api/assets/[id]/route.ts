/**
 * GET    /api/assets/:id — Get a single asset
 * PUT    /api/assets/:id — Update an asset
 * DELETE /api/assets/:id — Archive an asset
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getAssetById, updateAsset, deleteAsset } from '@/controller/assets';

const FORM_ID = 'assets.assets.asset';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { id } = await context.params;
  const asset = await getAssetById(user.currentTenantId!, id, user.id);

  if (!asset) {
    return NextResponse.json({ data: null, error: 'Asset not found' }, { status: 404 });
  }

  if (scope === 'OWN' && asset.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Asset not found' }, { status: 404 });
  }

  return NextResponse.json({ data: asset, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  try {
    const { id } = await context.params;

    if (scope === 'OWN') {
      const existing = await getAssetById(user.currentTenantId!, id, user.id);
      if (!existing || existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'Asset not found' }, { status: 404 });
      }
    }

    const body = await request.json();
    const result = await updateAsset(user.currentTenantId!, user.id, id, body);

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
  const auth = await authorize(request, FORM_ID, 'delete');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { id } = await context.params;

  if (scope === 'OWN') {
    const existing = await getAssetById(user.currentTenantId!, id, user.id);
    if (!existing || existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'Asset not found' }, { status: 404 });
    }
  }

  const deleted = await deleteAsset(user.currentTenantId!, user.id, id);

  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Asset not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
