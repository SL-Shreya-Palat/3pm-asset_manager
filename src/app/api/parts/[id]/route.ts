/**
 * GET    /api/parts/:id -- Get a single part
 * PUT    /api/parts/:id -- Update a part
 * DELETE /api/parts/:id -- Archive a part
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getPartById, updatePart, deletePart } from '@/controller/parts';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const part = await getPartById(user.currentTenantId, id);
  if (!part) {
    return NextResponse.json({ data: null, error: 'Part not found' }, { status: 404 });
  }
  return NextResponse.json({ data: part, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await updatePart(user.currentTenantId, user.id, id, body);
    if (result.error) {
      const status = result.error === 'Part not found' ? 404 : 400;
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
  const deleted = await deletePart(user.currentTenantId, user.id, id);
  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Part not found' }, { status: 404 });
  }
  return NextResponse.json({ data: { success: true }, error: null });
}
