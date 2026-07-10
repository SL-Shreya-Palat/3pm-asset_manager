/**
 * GET  /api/teams -- List teams with pagination/search
 * POST /api/teams -- Create a new team
 */
import { NextRequest, NextResponse } from "next/server";
import { getAllTeams, createTeam } from "@/controller/work-orders/teams";
import { authorize } from '@/lib/authz';

const FORM_ID = 'people.teams.team';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "25", 10);
  const search = searchParams.get("search") || undefined;
  const showArchived = searchParams.get("showArchived") === "true";

  const createdBy = scope === 'OWN' ? user.id : undefined;

  const result = await getAllTeams(user.currentTenantId!, {
    page,
    limit,
    search,
    showArchived,
    createdBy,
    teamIds: teamIds ?? undefined,
  });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const body = await request.json();
    const result = await createTeam(user.currentTenantId!, user.id, body);

    if (result.error) {
      return NextResponse.json(
        { data: null, error: result.error },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { data: result.data, error: null },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid request body" },
      { status: 400 },
    );
  }
}
