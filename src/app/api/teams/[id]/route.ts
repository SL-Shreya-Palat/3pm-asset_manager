/**
 * GET    /api/teams/:id -- Get a single team
 * PUT    /api/teams/:id -- Update a team
 * DELETE /api/teams/:id -- Archive a team
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getTeamById, updateTeam, deleteTeam } from '@/controller/teams';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const team = await getTeamById(user.currentTenantId, id);

  if (!team) {
    return NextResponse.json({ data: null, error: 'Team not found' }, { status: 404 });
  }

  return NextResponse.json({ data: team, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await updateTeam(user.currentTenantId, user.id, id, body);

    if (result.error) {
      const status = result.error === 'Team not found' ? 404 : 400;
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
  const deleted = await deleteTeam(user.currentTenantId, user.id, id);

  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Team not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
