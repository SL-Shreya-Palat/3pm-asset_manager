/**
 * GET    /api/defects/:id -- Get a single defect
 * PUT    /api/defects/:id -- Update a defect
 * DELETE /api/defects/:id -- Permanently delete a defect
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  getDefectById,
  updateDefect,
  deleteDefect,
} from '@/controller/defects';
import { getFormPermissionLevels } from '@/lib/server-permissions';

const FORM_ID = 'maintenance.defects.defect';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const defect = await getDefectById(user.currentTenantId, id);
  if (!defect) {
    return NextResponse.json({ data: null, error: 'Defect not found' }, { status: 404 });
  }

  // "OWN" view: block access to records the user didn't create
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.view === 'OWN' && defect.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Defect not found' }, { status: 404 });
  }

  return NextResponse.json({ data: defect, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    // "OWN" edit: verify the user created this defect
    const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
    if (perms.edit === 'OWN') {
      const existing = await getDefectById(user.currentTenantId, id);
      if (!existing) {
        return NextResponse.json({ data: null, error: 'Defect not found' }, { status: 404 });
      }
      if (existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit defects you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updateDefect(user.currentTenantId, user.id, id, body);

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
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  // "OWN" delete: verify the user created this defect
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.delete === 'OWN') {
    const existing = await getDefectById(user.currentTenantId, id);
    if (!existing) {
      return NextResponse.json({ data: null, error: 'Defect not found' }, { status: 404 });
    }
    if (existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete defects you created' }, { status: 403 });
    }
  }

  const deleted = await deleteDefect(user.currentTenantId, user.id, id);
  if (!deleted) {
    return NextResponse.json(
      { data: null, error: 'Defect not found' },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: { success: true }, error: null });
}
