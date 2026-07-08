import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getAllAssetTypes, createAssetType, updateAssetType, deleteAssetType, archiveAssetType, getAssetTypeById } from '@/controller/assetTypes';
import { getFormPermissionLevels } from '@/lib/server-permissions';

const FORM_ID = 'settings.assetTypes.assetType';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });

  const search = request.nextUrl.searchParams.get('search') || undefined;
  const showArchived = request.nextUrl.searchParams.get('showArchived') === 'true';

  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.view === 'NONE') {
    return NextResponse.json({ data: null, error: 'You do not have permission to view asset types' }, { status: 403 });
  }
  const createdBy = perms.view === 'OWN' ? user.id : undefined;

  const items = await getAllAssetTypes(user.currentTenantId, search, { showArchived, createdBy });
  return NextResponse.json({ data: items, error: null });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });

  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (!perms.create) {
    return NextResponse.json({ data: null, error: 'You do not have permission to create asset types' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const result = await createAssetType(user.currentTenantId, user.id, body);
    if (result.error) return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { id, ...input } = body;
    if (!id) return NextResponse.json({ data: null, error: 'ID is required' }, { status: 400 });

    const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
    if (perms.edit === false) {
      return NextResponse.json({ data: null, error: 'You do not have permission to edit asset types' }, { status: 403 });
    }
    if (perms.edit === 'OWN') {
      const existing = await getAssetTypeById(user.currentTenantId, id);
      if (!existing) {
        return NextResponse.json({ data: null, error: 'Asset type not found' }, { status: 404 });
      }
      if (existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit asset types you created' }, { status: 403 });
      }
    }

    const result = await updateAssetType(user.currentTenantId, user.id, id, input);
    if (result.error) return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ data: null, error: 'ID is required' }, { status: 400 });

  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.delete === false) {
    return NextResponse.json({ data: null, error: 'You do not have permission to delete asset types' }, { status: 403 });
  }
  if (perms.delete === 'OWN') {
    const existing = await getAssetTypeById(user.currentTenantId, id);
    if (!existing) {
      return NextResponse.json({ data: null, error: 'Asset type not found' }, { status: 404 });
    }
    if (existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete asset types you created' }, { status: 403 });
    }
  }

  const deleted = await deleteAssetType(user.currentTenantId, id);
  if (!deleted) return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ data: { success: true }, error: null });
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { id, archived } = body;
    if (!id) return NextResponse.json({ data: null, error: 'ID is required' }, { status: 400 });
    if (typeof archived !== 'boolean') return NextResponse.json({ data: null, error: 'archived must be a boolean' }, { status: 400 });

    const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
    if (perms.archive === false) {
      return NextResponse.json({ data: null, error: 'You do not have permission to archive asset types' }, { status: 403 });
    }
    if (perms.archive === 'OWN') {
      const existing = await getAssetTypeById(user.currentTenantId, id);
      if (!existing) {
        return NextResponse.json({ data: null, error: 'Asset type not found' }, { status: 404 });
      }
      if (existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only archive asset types you created' }, { status: 403 });
      }
    }

    const success = await archiveAssetType(user.currentTenantId, user.id, id, archived);
    if (!success) return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: { success: true }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
