/**
 * GET    /api/service-tasks/:id -- Get a single service task
 * PUT    /api/service-tasks/:id -- Update a service task
 * DELETE /api/service-tasks/:id -- Archive a service task
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServiceTaskById, updateServiceTask, deleteServiceTask } from '@/controller/service-tasks';
import { authorize } from '@/lib/authz';

const FORM_ID = 'maintenance.serviceTasks.serviceTask';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { id } = await context.params;
  const task = await getServiceTaskById(user.currentTenantId!, id);

  if (!task) {
    return NextResponse.json({ data: null, error: 'Service task not found' }, { status: 404 });
  }

  if (scope === 'OWN' && task.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Service task not found' }, { status: 404 });
  }

  return NextResponse.json({ data: task, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  try {
    const { id } = await context.params;

    // "OWN" edit: verify the user created this service task
    if (scope === 'OWN') {
      const existing = await getServiceTaskById(user.currentTenantId!, id);
      if (!existing || existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit service tasks you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updateServiceTask(user.currentTenantId!, user.id, id, body);

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
  const auth = await authorize(request, FORM_ID, 'delete');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { id } = await context.params;

  // "OWN" delete: verify the user created this service task
  if (scope === 'OWN') {
    const existing = await getServiceTaskById(user.currentTenantId!, id);
    if (!existing || existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete service tasks you created' }, { status: 403 });
    }
  }

  const deleted = await deleteServiceTask(user.currentTenantId!, user.id, id);
  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Service task not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
