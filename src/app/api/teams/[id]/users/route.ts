/**
 * POST   /api/teams/:id/users  — Bulk-add users to a team
 * DELETE /api/teams/:id/users  — Remove a user from a team
 * PATCH  /api/teams/:id/users  — Update a user's team role (managing / following)
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize, inTeamScope } from '@/lib/authz';
import { addUsersToTeam, removeUserFromTeam, updateUserTeamRole } from '@/controller/users';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, 'people.teams.team', 'edit');
  if (!auth.ok) return auth.res;
  const { user, teamIds } = auth.ctx;

  try {
    const { id: teamId } = await context.params;
    if (!inTeamScope(teamIds, teamId)) {
      return NextResponse.json({ data: null, error: 'Team not found' }, { status: 404 });
    }
    const body = await request.json();
    const memberIds: string[] = body.memberIds;
    const role: 'managing' | 'following' = body.role || 'following';

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json({ data: null, error: 'memberIds is required' }, { status: 400 });
    }

    const count = await addUsersToTeam(user.currentTenantId!, user.id, teamId, memberIds, role);
    return NextResponse.json({ data: { modified: count }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, 'people.teams.team', 'edit');
  if (!auth.ok) return auth.res;
  const { user, teamIds } = auth.ctx;

  try {
    const { id: teamId } = await context.params;
    if (!inTeamScope(teamIds, teamId)) {
      return NextResponse.json({ data: null, error: 'Team not found' }, { status: 404 });
    }
    const { searchParams } = request.nextUrl;
    const memberId = searchParams.get('memberId');

    if (!memberId) {
      return NextResponse.json({ data: null, error: 'memberId query param is required' }, { status: 400 });
    }

    const removed = await removeUserFromTeam(user.currentTenantId!, user.id, teamId, memberId);
    if (!removed) {
      return NextResponse.json({ data: null, error: 'User not found in team' }, { status: 404 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, 'people.teams.team', 'edit');
  if (!auth.ok) return auth.res;
  const { user, teamIds } = auth.ctx;

  try {
    const { id: teamId } = await context.params;
    if (!inTeamScope(teamIds, teamId)) {
      return NextResponse.json({ data: null, error: 'Team not found' }, { status: 404 });
    }
    const body = await request.json();
    const { memberId, role } = body;

    if (!memberId) {
      return NextResponse.json({ data: null, error: 'memberId is required' }, { status: 400 });
    }

    if (role !== 'managing' && role !== 'following') {
      return NextResponse.json({ data: null, error: 'role must be "managing" or "following"' }, { status: 400 });
    }

    const updated = await updateUserTeamRole(user.currentTenantId!, user.id, teamId, memberId, role);
    if (!updated) {
      return NextResponse.json({ data: null, error: 'User not found in team' }, { status: 404 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
