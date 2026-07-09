/**
 * GET    /api/faults/:id -- Get a single fault
 * PUT    /api/faults/:id -- Update a fault
 * DELETE /api/faults/:id -- Archive a fault
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getFaultById,
  updateFault,
  deleteFault,
} from '@/controller/faults';
import { authorize } from '@/lib/authz';

const FORM_ID = 'maintenance.faults.fault';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { id } = await context.params;
  const fault = await getFaultById(user.currentTenantId!, id);
  if (!fault) {
    return NextResponse.json({ data: null, error: 'Fault not found' }, { status: 404 });
  }
  if (scope === 'OWN' && fault.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Fault not found' }, { status: 404 });
  }

  return NextResponse.json({ data: fault, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  try {
    const { id } = await context.params;

    if (scope === 'OWN') {
      const existing = await getFaultById(user.currentTenantId!, id);
      if (!existing || existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit faults you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updateFault(user.currentTenantId!, user.id, id, body);

    if (result.error) {
      const status = result.error === 'Fault not found' ? 404 : 400;
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

  if (scope === 'OWN') {
    const existing = await getFaultById(user.currentTenantId!, id);
    if (!existing || existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete faults you created' }, { status: 403 });
    }
  }

  const deleted = await deleteFault(user.currentTenantId!, user.id, id);
  if (!deleted) {
    return NextResponse.json(
      { data: null, error: 'Fault not found' },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: { success: true }, error: null });
}
