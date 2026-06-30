/**
 * GET    /api/defects/:id -- Get a single defect
 * PUT    /api/defects/:id -- Update a defect
 * DELETE /api/defects/:id -- Archive a defect
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  getDefectById,
  updateDefect,
  deleteDefect,
} from '@/controller/defects';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const defect = await getDefectById(user.currentTenantId, id);
  if (!defect) {
    return NextResponse.json({ data: null, error: 'Defect not found' }, { status: 404 });
  }
  return NextResponse.json({ data: defect, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await updateDefect(user.currentTenantId, user.id, id, body);

    if (result.error) {
      const status = result.error === 'Defect not found' ? 404 : 400;
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
  const deleted = await deleteDefect(user.currentTenantId, user.id, id);
  if (!deleted) {
    return NextResponse.json(
      { data: null, error: 'Defect not found' },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: { success: true }, error: null });
}
