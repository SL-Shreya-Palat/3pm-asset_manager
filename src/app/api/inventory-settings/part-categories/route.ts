import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getAllPartCategories, createPartCategory, updatePartCategory, deletePartCategory, archivePartCategory } from '@/controller/inventory-settings';

const FORM_ID = 'settings.partCategories.partCategory';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const search = request.nextUrl.searchParams.get('search') || undefined;
  const showArchived = request.nextUrl.searchParams.get('showArchived') === 'true';

  const createdBy = scope === 'OWN' ? user.id : undefined;

  const items = await getAllPartCategories(user.currentTenantId, search, { showArchived, createdBy });
  return NextResponse.json({ data: items, error: null });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const body = await request.json();
    const result = await createPartCategory(user.currentTenantId, user.id, body);
    if (result.error) return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const body = await request.json();
    const { id, ...input } = body;
    if (!id) return NextResponse.json({ data: null, error: 'ID is required' }, { status: 400 });
    const result = await updatePartCategory(user.currentTenantId, user.id, id, input);
    if (result.error) return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'delete');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ data: null, error: 'ID is required' }, { status: 400 });
  const deleted = await deletePartCategory(user.currentTenantId, id);
  if (!deleted) return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ data: { success: true }, error: null });
}

export async function PATCH(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'archive');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const body = await request.json();
    const { id, archived } = body;
    if (!id) return NextResponse.json({ data: null, error: 'ID is required' }, { status: 400 });
    if (typeof archived !== 'boolean') return NextResponse.json({ data: null, error: 'archived must be a boolean' }, { status: 400 });
    const success = await archivePartCategory(user.currentTenantId, user.id, id, archived);
    if (!success) return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: { success: true }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
