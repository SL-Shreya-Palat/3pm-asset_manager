/**
 * GET    /api/faults/:id -- Get a single fault
 * PUT    /api/faults/:id -- Update a fault
 * DELETE /api/faults/:id -- Archive a fault
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  getFaultById,
  updateFault,
  deleteFault,
} from '@/controller/faults';
import { getFormPermissionLevels } from '@/lib/server-permissions';

const FORM_ID = 'maintenance.faults.fault';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const fault = await getFaultById(user.currentTenantId, id);
  if (!fault) {
    return NextResponse.json({ data: null, error: 'Fault not found' }, { status: 404 });
  }

  // "OWN" view: block access to records the user didn't create
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.view === 'OWN' && fault.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Fault not found' }, { status: 404 });
  }

  return NextResponse.json({ data: fault, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    // "OWN" edit: verify the user created this fault
    const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
    if (perms.edit === 'OWN') {
      const existing = await getFaultById(user.currentTenantId, id);
      if (!existing) {
        return NextResponse.json({ data: null, error: 'Fault not found' }, { status: 404 });
      }
      if (existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit faults you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updateFault(user.currentTenantId, user.id, id, body);

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
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  // "OWN" delete: verify the user created this fault
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.delete === 'OWN') {
    const existing = await getFaultById(user.currentTenantId, id);
    if (!existing) {
      return NextResponse.json({ data: null, error: 'Fault not found' }, { status: 404 });
    }
    if (existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete faults you created' }, { status: 403 });
    }
  }

  const deleted = await deleteFault(user.currentTenantId, user.id, id);
  if (!deleted) {
    return NextResponse.json(
      { data: null, error: 'Fault not found' },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: { success: true }, error: null });
}
