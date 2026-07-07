/**
 * GET    /api/fuel/:id -- Get a single fuel transaction
 * PUT    /api/fuel/:id -- Update a fuel transaction
 * DELETE /api/fuel/:id -- Archive a fuel transaction
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getFuelTransactionById, updateFuelTransaction, deleteFuelTransaction } from '@/controller/fuel';
import { getFormPermissionLevels } from '@/lib/server-permissions';

const FORM_ID = 'fuel.fuel.fuelEntry';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const transaction = await getFuelTransactionById(user.currentTenantId, id);

  if (!transaction) {
    return NextResponse.json({ data: null, error: 'Fuel transaction not found' }, { status: 404 });
  }

  // "OWN" view: block access to records the user didn't create
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.view === 'OWN' && transaction.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Fuel transaction not found' }, { status: 404 });
  }

  return NextResponse.json({ data: transaction, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    // "OWN" edit: verify the user created this fuel transaction
    const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
    if (perms.edit === 'OWN') {
      const existing = await getFuelTransactionById(user.currentTenantId, id);
      if (!existing) {
        return NextResponse.json({ data: null, error: 'Fuel transaction not found' }, { status: 404 });
      }
      if (existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit fuel entries you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updateFuelTransaction(user.currentTenantId, user.id, id, body);

    if (result.error) {
      const status = result.error === 'Fuel transaction not found' ? 404 : 400;
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

  // "OWN" delete: verify the user created this fuel transaction
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.delete === 'OWN') {
    const existing = await getFuelTransactionById(user.currentTenantId, id);
    if (!existing) {
      return NextResponse.json({ data: null, error: 'Fuel transaction not found' }, { status: 404 });
    }
    if (existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete fuel entries you created' }, { status: 403 });
    }
  }

  const deleted = await deleteFuelTransaction(user.currentTenantId, user.id, id);

  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Fuel transaction not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
