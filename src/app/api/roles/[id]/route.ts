/**
 * GET    /api/roles/:id -- Get a single role
 * PUT    /api/roles/:id -- Update a role
 * DELETE /api/roles/:id -- Archive a role
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getRoleById, updateRole, deleteRole } from '@/controller/roles';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const role = await getRoleById(user.currentTenantId, id);

  if (!role) {
    return NextResponse.json({ data: null, error: 'Role not found' }, { status: 404 });
  }

  return NextResponse.json({ data: role, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await updateRole(user.currentTenantId, user.id, id, body);

    if (result.error) {
      const status = result.error === 'Role not found' ? 404 : 400;
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
  const deleted = await deleteRole(user.currentTenantId, user.id, id);

  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Role not found or is a system role' }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
