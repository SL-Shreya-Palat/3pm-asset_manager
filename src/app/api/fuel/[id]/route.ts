/**
 * GET    /api/fuel/:id -- Get a single fuel transaction
 * PUT    /api/fuel/:id -- Update a fuel transaction
 * DELETE /api/fuel/:id -- Permanently delete a fuel transaction
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFuelTransactionById, updateFuelTransaction, deleteFuelTransaction } from '@/controller/fuel';
import { authorize } from '@/lib/authz';

const FORM_ID = 'fuel.fuel.fuelEntry';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { id } = await context.params;
  const transaction = await getFuelTransactionById(user.currentTenantId!, id);

  if (!transaction) {
    return NextResponse.json({ data: null, error: 'Fuel transaction not found' }, { status: 404 });
  }
  if (scope === 'OWN' && transaction.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Fuel transaction not found' }, { status: 404 });
  }

  return NextResponse.json({ data: transaction, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  try {
    const { id } = await context.params;

    if (scope === 'OWN') {
      const existing = await getFuelTransactionById(user.currentTenantId!, id);
      if (!existing || existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit fuel entries you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updateFuelTransaction(user.currentTenantId!, user.id, id, body);

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
  const auth = await authorize(request, FORM_ID, 'delete');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { id } = await context.params;

  if (scope === 'OWN') {
    const existing = await getFuelTransactionById(user.currentTenantId!, id);
    if (!existing || existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete fuel entries you created' }, { status: 403 });
    }
  }

  const deleted = await deleteFuelTransaction(user.currentTenantId!, user.id, id);

  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Fuel transaction not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
