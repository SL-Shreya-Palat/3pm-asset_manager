/**
 * GET    /api/drivers/:id -- Get a single driver
 * PUT    /api/drivers/:id -- Update a driver
 * DELETE /api/drivers/:id -- Archive a driver
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDriverById, updateDriver, deleteDriver } from '@/controller/drivers';
import { authorize, inTeamScope } from '@/lib/authz';

const FORM_ID = 'people.drivers.driver';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  const { id } = await context.params;
  const driver = await getDriverById(user.currentTenantId!, id);
  if (!driver) {
    return NextResponse.json({ data: null, error: 'Driver not found' }, { status: 404 });
  }

  if ((scope === 'OWN' && driver.createdBy !== user.id) || !inTeamScope(teamIds, driver.teamId)) {
    return NextResponse.json({ data: null, error: 'Driver not found' }, { status: 404 });
  }

  return NextResponse.json({ data: driver, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  try {
    const { id } = await context.params;

    if (scope === 'OWN' || teamIds) {
      const existing = await getDriverById(user.currentTenantId!, id);
      if (
        !existing ||
        (scope === 'OWN' && existing.createdBy !== user.id) ||
        !inTeamScope(teamIds, existing.teamId)
      ) {
        return NextResponse.json({ data: null, error: 'Driver not found' }, { status: 404 });
      }
    }

    const body = await request.json();
    const result = await updateDriver(user.currentTenantId!, user.id, id, body);

    if (result.error) {
      const status = result.error === 'Driver not found' ? 404 : 400;
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
    const existing = await getDriverById(user.currentTenantId!, id);
    if (
      !existing ||
      (scope === 'OWN' && existing.createdBy !== user.id) ||
      !inTeamScope(teamIds, existing.teamId)
    ) {
      return NextResponse.json({ data: null, error: 'Driver not found' }, { status: 404 });
    }
  }

  const deleted = await deleteDriver(user.currentTenantId!, user.id, id);

  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Driver not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
