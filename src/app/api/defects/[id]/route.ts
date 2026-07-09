/**
 * GET    /api/defects/:id -- Get a single defect
 * PUT    /api/defects/:id -- Update a defect
 * DELETE /api/defects/:id -- Permanently delete a defect
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getDefectById,
  updateDefect,
  deleteDefect,
} from '@/controller/defects';
import { authorize } from '@/lib/authz';

const FORM_ID = 'maintenance.defects.defect';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { id } = await context.params;
  const defect = await getDefectById(user.currentTenantId!, id);
  if (!defect) {
    return NextResponse.json({ data: null, error: 'Defect not found' }, { status: 404 });
  }
  if (scope === 'OWN' && defect.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Defect not found' }, { status: 404 });
  }

  return NextResponse.json({ data: defect, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  try {
    const { id } = await context.params;

    if (scope === 'OWN') {
      const existing = await getDefectById(user.currentTenantId!, id);
      if (!existing || existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit defects you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updateDefect(user.currentTenantId!, user.id, id, body);

    if (result.error) {
      const status = result.error === 'Defect not found' ? 404 : 400;
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
    const existing = await getDefectById(user.currentTenantId!, id);
    if (!existing || existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete defects you created' }, { status: 403 });
    }
  }

  const deleted = await deleteDefect(user.currentTenantId!, user.id, id);
  if (!deleted) {
    return NextResponse.json(
      { data: null, error: 'Defect not found' },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: { success: true }, error: null });
}
