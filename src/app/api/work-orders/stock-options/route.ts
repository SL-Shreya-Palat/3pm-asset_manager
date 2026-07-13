/**
 * GET /api/work-orders/stock-options
 *
 * Lists the tenant's stock (parts) for the work-order stock picker.
 *
 * Authorized by the WORK ORDER *edit* permission — deliberately NOT the
 * inventory view permission — so a mechanic (who has no inventory grant) can
 * still pick stock while editing a work order. The stock actually consumed on
 * save is applied inside the work-order update under this same edit grant, so
 * no separate inventory permission is ever required for the WO flow.
 *
 * Parts are tenant-wide shared data (not OWN/team scoped), so the full catalog
 * is returned regardless of the caller's work-order scope.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getAllParts } from '@/controller/parts';

const FORM_ID = 'maintenance.workOrders.workOrder';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const search = searchParams.get('search') || undefined;

  const result = await getAllParts(user.currentTenantId!, { page, limit, search, userId: user.id });
  return NextResponse.json({ data: result, error: null });
}
