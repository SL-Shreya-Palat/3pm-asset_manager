/**
 * GET    /api/vendors/:id -- Get a single vendor
 * PUT    /api/vendors/:id -- Update a vendor
 * DELETE /api/vendors/:id -- Archive a vendor
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getVendorById, updateVendor, deleteVendor } from '@/controller/vendors';

const FORM_ID = 'vendors.vendors.vendor';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const { id } = await context.params;
  const vendor = await getVendorById(user.currentTenantId!, id);

  if (!vendor) {
    return NextResponse.json({ data: null, error: 'Vendor not found' }, { status: 404 });
  }

  return NextResponse.json({ data: vendor, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await updateVendor(user.currentTenantId!, user.id, id, body);

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
  const auth = await authorize(request, FORM_ID, 'delete');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const { id } = await context.params;
  const result = await deleteVendor(user.currentTenantId!, user.id, id);

  if (!result.deleted) {
    const status = result.error === 'Vendor not found' ? 404 : 400;
    return NextResponse.json({ data: null, error: result.error }, { status });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
