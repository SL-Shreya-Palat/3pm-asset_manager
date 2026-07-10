/**
 * GET    /api/teams/:id -- Get a single team
 * PUT    /api/teams/:id -- Update a team
 * DELETE /api/teams/:id -- Archive a team
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getTeamById,
  updateTeam,
  deleteTeam,
} from "@/controller/work-orders/teams";
import { authorize, inTeamScope } from '@/lib/authz';

const FORM_ID = 'people.teams.team';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  const { id } = await context.params;
  if (!inTeamScope(teamIds, id)) {
    return NextResponse.json({ data: null, error: 'Team not found' }, { status: 404 });
  }
  const team = await getTeamById(user.currentTenantId!, id);

  if (!team) {
    return NextResponse.json(
      { data: null, error: "Team not found" },
      { status: 404 },
    );
  }

  if (scope === 'OWN' && team.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Team not found' }, { status: 404 });
  }

  return NextResponse.json({ data: team, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  try {
    const { id } = await context.params;
    if (!inTeamScope(teamIds, id)) {
      return NextResponse.json({ data: null, error: 'Team not found' }, { status: 404 });
    }

    // "OWN" edit: verify the user created this team
    if (scope === 'OWN') {
      const existing = await getTeamById(user.currentTenantId!, id);
      if (!existing || existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit teams you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updateTeam(user.currentTenantId!, user.id, id, body);

    if (result.error) {
      const status = result.error === "Team not found" ? 404 : 400;
      return NextResponse.json({ data: null, error: result.error }, { status });
    }

    return NextResponse.json({ data: result.data, error: null });
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid request body" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'delete');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  const { id } = await context.params;
  if (!inTeamScope(teamIds, id)) {
    return NextResponse.json({ data: null, error: 'Team not found' }, { status: 404 });
  }

  // "OWN" delete: verify the user created this team
  if (scope === 'OWN') {
    const existing = await getTeamById(user.currentTenantId!, id);
    if (!existing || existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete teams you created' }, { status: 403 });
    }
  }

  const deleted = await deleteTeam(user.currentTenantId!, user.id, id);

  if (!deleted) {
    return NextResponse.json(
      { data: null, error: "Team not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
