/**
 * GET  /api/parts -- List parts with pagination/search/category filter
 * POST /api/parts -- Create a new part
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getAllParts, createPart } from '@/controller/parts';
import { getFormPermissionLevels } from '@/lib/server-permissions';

const FORM_ID = 'maintenance.inventory.inventoryItem';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const search = searchParams.get('search') || undefined;
  const categoryId = searchParams.get('categoryId') || undefined;
  const showArchived = searchParams.get('showArchived') === 'true';

  // Check if user has "OWN" view level — scope results to their records only
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  const createdBy = perms.view === 'OWN' ? user.id : undefined;

  const result = await getAllParts(user.currentTenantId, { page, limit, search, categoryId, showArchived, createdBy });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await createPart(user.currentTenantId, user.id, body);
    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
