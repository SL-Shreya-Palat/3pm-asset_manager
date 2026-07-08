/**
 * GET  /api/teams -- List teams with pagination/search
 * POST /api/teams -- Create a new team
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helper";
import { getAllTeams, createTeam } from "@/controller/work-orders/teams";
import { getFormPermissionLevels } from "@/lib/server-permissions";

const FORM_ID = 'people.teams.team';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "25", 10);
  const search = searchParams.get("search") || undefined;
  const showArchived = searchParams.get("showArchived") === "true";

  // Check if user has "OWN" view level — scope results to their records only
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  const createdBy = perms.view === 'OWN' ? user.id : undefined;

  const result = await getAllTeams(user.currentTenantId, {
    page,
    limit,
    search,
    showArchived,
    createdBy,
  });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const result = await createTeam(user.currentTenantId, user.id, body);

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
