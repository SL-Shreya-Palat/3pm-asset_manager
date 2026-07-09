/**
 * GET  /api/vendors -- List vendors with pagination/search/type filter
 * POST /api/vendors -- Create a new vendor
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getAllVendors, createVendor } from '@/controller/vendors';

const FORM_ID = 'vendors.vendors.vendor';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const search = searchParams.get('search') || undefined;
  const vendorType = searchParams.get('vendorType') || undefined;
  const showArchived = searchParams.get('showArchived') === 'true';

  const result = await getAllVendors(user.currentTenantId!, { page, limit, search, vendorType, showArchived, userId: user.id });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const body = await request.json();
    const result = await createVendor(user.currentTenantId!, user.id, body);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
