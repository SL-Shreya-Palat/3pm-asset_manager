/**
 * GET  /api/purchase-orders -- List purchase orders with pagination/search/status filter
 * POST /api/purchase-orders -- Create a new purchase order
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getAllPurchaseOrders, createPurchaseOrder } from '@/controller/purchase-orders';

const FORM_ID = 'maintenance.purchaseOrders.purchaseOrder';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;
  const createdBy = scope === 'OWN' ? user.id : undefined;

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const search = searchParams.get('search') || undefined;
  const status = searchParams.get('status') || undefined;
  const showArchived = searchParams.get('showArchived') === 'true';

  const result = await getAllPurchaseOrders(user.currentTenantId!, { page, limit, search, status, showArchived, createdBy });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const body = await request.json();
    const result = await createPurchaseOrder(user.currentTenantId!, user.id, body);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
