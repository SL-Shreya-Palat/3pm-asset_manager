/**
 * POST   /api/teams/:id/inspections — Bulk-add inspections to a team
 * DELETE /api/teams/:id/inspections — Remove an inspection from a team
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { addTeamToInspections, removeTeamFromInspection } from '@/controller/inspection-submissions';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id: teamId } = await context.params;
    const body = await request.json();
    const inspectionIds: string[] = body.inspectionIds;

    if (!Array.isArray(inspectionIds) || inspectionIds.length === 0) {
      return NextResponse.json({ data: null, error: 'inspectionIds is required' }, { status: 400 });
    }

    const count = await addTeamToInspections(user.currentTenantId, user.id, teamId, inspectionIds);
    return NextResponse.json({ data: { modified: count }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id: teamId } = await context.params;
    const { searchParams } = request.nextUrl;
    const inspectionId = searchParams.get('inspectionId');

    if (!inspectionId) {
      return NextResponse.json({ data: null, error: 'inspectionId query param is required' }, { status: 400 });
    }

    const removed = await removeTeamFromInspection(user.currentTenantId, user.id, teamId, inspectionId);
    if (!removed) {
      return NextResponse.json({ data: null, error: 'Inspection not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request' }, { status: 400 });
  }
}
