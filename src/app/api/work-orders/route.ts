/**
 * GET  /api/work-orders -- List work orders with pagination/search/status filter
 * POST /api/work-orders -- Create a new work order
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUserRoleForTenant } from '@/lib/auth-helper';
import { getAllWorkOrders, createWorkOrder } from '@/controller/work-orders';
import { authorize } from '@/lib/authz';

const FORM_ID = 'maintenance.workOrders.workOrder';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const search = searchParams.get('search') || undefined;
  const statusId = searchParams.get('statusId') || undefined;

  // Role-based scoping: full-access roles (owner/admin/manager) see every work
  // order; everyone else (e.g. mechanics) sees only the ones assigned to them.
  const role = await getUserRoleForTenant(user.id, user.currentTenantId!);
  const assigneeId = role && !role.fullAccess ? user.id : undefined;
  const showArchived = searchParams.get('showArchived') === 'true';

  const createdBy = scope === 'OWN' ? user.id : undefined;

  const result = await getAllWorkOrders(user.currentTenantId!, { page, limit, search, statusId, assigneeId, showArchived, createdBy });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const body = await request.json();
    const result = await createWorkOrder(user.currentTenantId!, user.id, body);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
