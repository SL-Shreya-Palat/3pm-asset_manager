/**
 * GET    /api/parts/:id -- Get a single part
 * PUT    /api/parts/:id -- Update a part
 * DELETE /api/parts/:id -- Archive a part
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getPartById, updatePart, deletePart } from '@/controller/parts';
import { getFormPermissionLevels } from '@/lib/server-permissions';

const FORM_ID = 'maintenance.inventory.inventoryItem';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const part = await getPartById(user.currentTenantId, id);
  if (!part) {
    return NextResponse.json({ data: null, error: 'Part not found' }, { status: 404 });
  }

  // "OWN" view: block access to records the user didn't create
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.view === 'OWN' && part.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Part not found' }, { status: 404 });
  }

  return NextResponse.json({ data: part, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    // "OWN" edit: verify the user created this part
    const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
    if (perms.edit === 'OWN') {
      const existing = await getPartById(user.currentTenantId, id);
      if (!existing) {
        return NextResponse.json({ data: null, error: 'Part not found' }, { status: 404 });
      }
      if (existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit parts you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updatePart(user.currentTenantId, user.id, id, body);
    if (result.error) {
      const status = result.error === 'Part not found' ? 404 : 400;
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

  // "OWN" delete: verify the user created this part
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.delete === 'OWN') {
    const existing = await getPartById(user.currentTenantId, id);
    if (!existing) {
      return NextResponse.json({ data: null, error: 'Part not found' }, { status: 404 });
    }
    if (existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete parts you created' }, { status: 403 });
    }
  }

  const deleted = await deletePart(user.currentTenantId, user.id, id);
  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Part not found' }, { status: 404 });
  }
  return NextResponse.json({ data: { success: true }, error: null });
}
