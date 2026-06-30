/**
 * GET    /api/drivers/:id -- Get a single driver
 * PUT    /api/drivers/:id -- Update a driver
 * DELETE /api/drivers/:id -- Archive a driver
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getDriverById, updateDriver, deleteDriver } from '@/controller/drivers';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const driver = await getDriverById(user.currentTenantId, id);

  if (!driver) {
    return NextResponse.json({ data: null, error: 'Driver not found' }, { status: 404 });
  }

  return NextResponse.json({ data: driver, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await updateDriver(user.currentTenantId, user.id, id, body);

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
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const deleted = await deleteDriver(user.currentTenantId, user.id, id);

  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Driver not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
