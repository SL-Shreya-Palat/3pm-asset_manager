/**
 * GET    /api/parts/:id -- Get a single part
 * PUT    /api/parts/:id -- Update a part
 * DELETE /api/parts/:id -- Archive a part
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPartById, updatePart, deletePart } from '@/controller/parts';
import { authorize } from '@/lib/authz';

const FORM_ID = 'maintenance.inventory.inventoryItem';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { id } = await context.params;
  const part = await getPartById(user.currentTenantId!, id);
  if (!part) {
    return NextResponse.json({ data: null, error: 'Part not found' }, { status: 404 });
  }
  if (scope === 'OWN' && part.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Part not found' }, { status: 404 });
  }

  return NextResponse.json({ data: part, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  try {
    const { id } = await context.params;

    if (scope === 'OWN') {
      const existing = await getPartById(user.currentTenantId!, id);
      if (!existing || existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit parts you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updatePart(user.currentTenantId!, user.id, id, body);
    if (result.error) {
      const status = result.error === 'Part not found' ? 404 : 400;
      return NextResponse.json({ data: null, error: result.error }, { status });
    }
    return NextResponse.json({
      data: result.data,
      error: null,
      ...('warning' in result && result.warning ? { warning: result.warning } : {}),
    });
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
    const existing = await getPartById(user.currentTenantId!, id);
    if (!existing || existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete parts you created' }, { status: 403 });
    }
  }

  const result = await deletePart(user.currentTenantId!, user.id, id);
  if (!result.deleted) {
    const status = result.error === 'Part not found' ? 404 : 400;
    return NextResponse.json({ data: null, error: result.error }, { status });
  }
  return NextResponse.json({ data: { success: true }, error: null });
}
