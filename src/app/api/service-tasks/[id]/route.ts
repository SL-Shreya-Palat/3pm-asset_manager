/**
 * GET    /api/service-tasks/:id -- Get a single service task
 * PUT    /api/service-tasks/:id -- Update a service task
 * DELETE /api/service-tasks/:id -- Archive a service task
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getServiceTaskById, updateServiceTask, deleteServiceTask } from '@/controller/service-tasks';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const task = await getServiceTaskById(user.currentTenantId, id);

  if (!task) {
    return NextResponse.json({ data: null, error: 'Service task not found' }, { status: 404 });
  }

  return NextResponse.json({ data: task, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await updateServiceTask(user.currentTenantId, user.id, id, body);

    if (result.error) {
      const status = result.error === 'Service task not found' ? 404 : 400;
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
  const deleted = await deleteServiceTask(user.currentTenantId, user.id, id);

  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Service task not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
