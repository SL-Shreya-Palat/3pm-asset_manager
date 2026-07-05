/**
 * GET  /api/purchase-orders -- List purchase orders with pagination/search/status filter
 * POST /api/purchase-orders -- Create a new purchase order
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getAllPurchaseOrders, createPurchaseOrder } from '@/controller/purchase-orders';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const search = searchParams.get('search') || undefined;
  const status = searchParams.get('status') || undefined;
  const showArchived = searchParams.get('showArchived') === 'true';

  const result = await getAllPurchaseOrders(user.currentTenantId, { page, limit, search, status, showArchived });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await createPurchaseOrder(user.currentTenantId, user.id, body);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
