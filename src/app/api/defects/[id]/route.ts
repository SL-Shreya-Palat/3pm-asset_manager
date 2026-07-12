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
import { authorize, inTeamScope } from '@/lib/authz';

const FORM_ID = 'maintenance.defects.defect';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  const { id } = await context.params;
  const defect = await getDefectById(user.currentTenantId!, id);
  if (!defect) {
    return NextResponse.json({ data: null, error: 'Defect not found' }, { status: 404 });
  }
  if ((scope === 'OWN' && defect.createdBy !== user.id) || !inTeamScope(teamIds, defect.teamIds)) {
    return NextResponse.json({ data: null, error: 'Defect not found' }, { status: 404 });
  }

  return NextResponse.json({ data: defect, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  try {
    const { id } = await context.params;

    if (scope === 'OWN' || teamIds) {
      const existing = await getDefectById(user.currentTenantId!, id);
      if (
        !existing ||
        (scope === 'OWN' && existing.createdBy !== user.id) ||
        !inTeamScope(teamIds, existing.teamIds)
      ) {
        return NextResponse.json({ data: null, error: 'Defect not found' }, { status: 404 });
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
  const { user, scope, teamIds } = auth.ctx;

  const { id } = await context.params;

  if (scope === 'OWN' || teamIds) {
    const existing = await getDefectById(user.currentTenantId!, id);
    if (
      !existing ||
      (scope === 'OWN' && existing.createdBy !== user.id) ||
      !inTeamScope(teamIds, existing.teamIds)
    ) {
      return NextResponse.json({ data: null, error: 'Defect not found' }, { status: 404 });
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
