/**
 * POST   /api/teams/:id/defects — Bulk-add defects to a team
 * DELETE /api/teams/:id/defects — Remove a defect from a team
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { addTeamToDefects, removeTeamFromDefect } from '@/controller/defects';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, 'people.teams.team', 'view');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const { id: teamId } = await context.params;
    const body = await request.json();
    const defectIds: string[] = body.defectIds;

    if (!Array.isArray(defectIds) || defectIds.length === 0) {
      return NextResponse.json({ data: null, error: 'defectIds is required' }, { status: 400 });
    }

    const count = await addTeamToDefects(user.currentTenantId!, user.id, teamId, defectIds);
    return NextResponse.json({ data: { modified: count }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, 'people.teams.team', 'view');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const { id: teamId } = await context.params;
    const { searchParams } = request.nextUrl;
    const defectId = searchParams.get('defectId');

    if (!defectId) {
      return NextResponse.json({ data: null, error: 'defectId query param is required' }, { status: 400 });
    }

    const removed = await removeTeamFromDefect(user.currentTenantId!, user.id, teamId, defectId);
    if (!removed) {
      return NextResponse.json({ data: null, error: 'Defect not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request' }, { status: 400 });
  }
}
