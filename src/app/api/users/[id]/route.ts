/**
 * GET    /api/users/:id -- Get a single tenant member
 * PUT    /api/users/:id -- Update a tenant member
 * DELETE /api/users/:id -- Deactivate a tenant member
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  getTenantMemberById,
  updateTenantMember,
  deactivateTenantMember,
} from '@/controller/users';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const member = await getTenantMemberById(user.currentTenantId, id);

  if (!member) {
    return NextResponse.json({ data: null, error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ data: member, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await updateTenantMember(user.currentTenantId, id, body);

    if (result.error) {
      const status = result.error === 'User not found' ? 404 : 400;
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
  const deactivated = await deactivateTenantMember(user.currentTenantId, id);

  if (!deactivated) {
    return NextResponse.json({ data: null, error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
