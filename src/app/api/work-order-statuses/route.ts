/**
 * GET    /api/work-order-statuses -- List work order statuses
 * POST   /api/work-order-statuses -- Create a new status
 * PUT    /api/work-order-statuses -- Update a status
 * DELETE /api/work-order-statuses -- Delete a status (by ?id=)
 * PATCH  /api/work-order-statuses -- Archive/unarchive a status
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import {
  getAllWorkOrderStatuses,
  getWorkOrderStatusById,
  createWorkOrderStatus,
  updateWorkOrderStatus,
  deleteWorkOrderStatus,
  archiveWorkOrderStatus,
  seedWorkOrderStatuses,
} from '@/controller/work-order-statuses';

const FORM_ID = 'settings.workOrderStatuses.workOrderStatus';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const search = request.nextUrl.searchParams.get('search') || undefined;
  const showArchived = request.nextUrl.searchParams.get('showArchived') === 'true';

  // Lazily backfill the default statuses for tenants that predate default
  // seeding. One-time per tenant (guarded by a tenant flag) and only triggered
  // by users who can manage statuses, so a read-only viewer never causes writes.
  if (auth.ctx.perms.create) {
    try {
      await seedWorkOrderStatuses(user.currentTenantId, user.id);
    } catch (err) {
      console.error('[work-order-statuses] lazy default seeding failed (non-fatal):', err);
    }
  }

  const createdBy = scope === 'OWN' ? user.id : undefined;

  const items = await getAllWorkOrderStatuses(user.currentTenantId, search, { showArchived, createdBy });
  return NextResponse.json({ data: items, error: null });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const body = await request.json();
    const result = await createWorkOrderStatus(user.currentTenantId, user.id, body);
    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  try {
    const body = await request.json();
    const { id, ...input } = body;
    if (!id) {
      return NextResponse.json({ data: null, error: 'ID is required' }, { status: 400 });
    }

    if (scope === 'OWN') {
      const existing = await getWorkOrderStatusById(user.currentTenantId, id);
      if (!existing) {
        return NextResponse.json({ data: null, error: 'Work order status not found' }, { status: 404 });
      }
      if (existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit work order statuses you created' }, { status: 403 });
      }
    }

    const result = await updateWorkOrderStatus(user.currentTenantId, user.id, id, input);
    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result.data, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'delete');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ data: null, error: 'ID is required' }, { status: 400 });
  }

  if (scope === 'OWN') {
    const existing = await getWorkOrderStatusById(user.currentTenantId, id);
    if (!existing) {
      return NextResponse.json({ data: null, error: 'Work order status not found' }, { status: 404 });
    }
    if (existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete work order statuses you created' }, { status: 403 });
    }
  }

  const deleted = await deleteWorkOrderStatus(user.currentTenantId, id);
  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ data: { success: true }, error: null });
}

export async function PATCH(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'archive');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  try {
    const body = await request.json();
    const { id, archived } = body;
    if (!id) return NextResponse.json({ data: null, error: 'ID is required' }, { status: 400 });
    if (typeof archived !== 'boolean') return NextResponse.json({ data: null, error: 'archived must be a boolean' }, { status: 400 });

    if (scope === 'OWN') {
      const existing = await getWorkOrderStatusById(user.currentTenantId, id);
      if (!existing) {
        return NextResponse.json({ data: null, error: 'Work order status not found' }, { status: 404 });
      }
      if (existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only archive work order statuses you created' }, { status: 403 });
      }
    }

    const success = await archiveWorkOrderStatus(user.currentTenantId, user.id, id, archived);
    if (!success) return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: { success: true }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
