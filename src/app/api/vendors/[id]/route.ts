/**
 * GET    /api/vendors/:id -- Get a single vendor
 * PUT    /api/vendors/:id -- Update a vendor
 * DELETE /api/vendors/:id -- Archive a vendor
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getVendorById, updateVendor, deleteVendor } from '@/controller/vendors';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const vendor = await getVendorById(user.currentTenantId, id);

  if (!vendor) {
    return NextResponse.json({ data: null, error: 'Vendor not found' }, { status: 404 });
  }

  return NextResponse.json({ data: vendor, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await updateVendor(user.currentTenantId, user.id, id, body);

    if (result.error) {
      const status = result.error === 'Vendor not found' ? 404 : 400;
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
  const deleted = await deleteVendor(user.currentTenantId, user.id, id);

  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Vendor not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
