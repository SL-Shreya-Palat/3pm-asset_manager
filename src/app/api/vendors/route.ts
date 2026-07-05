/**
 * GET  /api/vendors -- List vendors with pagination/search/type filter
 * POST /api/vendors -- Create a new vendor
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getAllVendors, createVendor } from '@/controller/vendors';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const search = searchParams.get('search') || undefined;
  const vendorType = searchParams.get('vendorType') || undefined;
  const showArchived = searchParams.get('showArchived') === 'true';

  const result = await getAllVendors(user.currentTenantId, { page, limit, search, vendorType, showArchived });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await createVendor(user.currentTenantId, user.id, body);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
