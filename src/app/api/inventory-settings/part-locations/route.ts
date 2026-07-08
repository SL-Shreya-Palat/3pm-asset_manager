import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getAllPartLocations, createPartLocation, updatePartLocation, deletePartLocation, archivePartLocation } from '@/controller/inventory-settings';
import { getFormPermissionLevels } from '@/lib/server-permissions';

const FORM_ID = 'settings.partLocations.partLocation';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });

  const search = request.nextUrl.searchParams.get('search') || undefined;
  const showArchived = request.nextUrl.searchParams.get('showArchived') === 'true';

  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  const createdBy = perms.view === 'OWN' ? user.id : undefined;

  const items = await getAllPartLocations(user.currentTenantId, search, { showArchived, createdBy });
  return NextResponse.json({ data: items, error: null });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const result = await createPartLocation(user.currentTenantId, user.id, body);
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
    const result = await updatePartLocation(user.currentTenantId, user.id, id, input);
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
  const deleted = await deletePartLocation(user.currentTenantId, id);
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
    const success = await archivePartLocation(user.currentTenantId, user.id, id, archived);
    if (!success) return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: { success: true }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
