/**
 * GET  /api/assets — List assets with pagination/search/filter
 * POST /api/assets — Create a new asset
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAllAssets, createAsset } from '@/controller/assets';
import { getDriverIdByEmail } from '@/controller/drivers';
import { authorize } from '@/lib/authz';
import { getUserRoleForTenant } from '@/lib/auth-helper';

const FORM_ID = 'assets.assets.asset';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const search = searchParams.get('search') || undefined;
  const status = searchParams.get('status') || undefined;
  const teamId = searchParams.get('teamId') || undefined;
  const complianceStatus = searchParams.get('complianceStatus') || undefined;
  const showArchived = searchParams.get('showArchived') === 'true';
  let createdBy = scope === 'OWN' ? user.id : undefined;

  // Driver logins honor the role's view level: 'ALL' shows the fleet; 'OWN'
  // means the assets granted to them via the asset's "Driver Access" (a driver
  // never *created* assets, so created-by would always be empty for them).
  // No linked driver record with 'OWN' → no grants → empty list.
  let driverAccessId: string | undefined;
  const role = await getUserRoleForTenant(user.id, user.currentTenantId!);
  if (role?.isDriver && scope === 'OWN') {
    const driverId = await getDriverIdByEmail(user.currentTenantId!, String(user.email || ''));
    if (!driverId) {
      return NextResponse.json({
        data: { items: [], pagination: { page, limit, total: 0, hasMore: false } },
        error: null,
      });
    }
    driverAccessId = driverId;
    createdBy = undefined;
  }

  const result = await getAllAssets(user.currentTenantId!, { page, limit, search, status, teamId, complianceStatus, showArchived, createdBy, userId: user.id, driverAccessId, teamIds: teamIds ?? undefined });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const body = await request.json();
    const result = await createAsset(user.currentTenantId!, user.id, body);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
