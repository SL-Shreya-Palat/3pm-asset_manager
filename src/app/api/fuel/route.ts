/**
 * GET  /api/fuel -- List fuel transactions with pagination/search/filters
 * POST /api/fuel -- Create a new fuel transaction
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getAllFuelTransactions, createFuelTransaction } from '@/controller/fuel';
import { getFormPermissionLevels } from '@/lib/server-permissions';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const search = searchParams.get('search') || undefined;
  const assetId = searchParams.get('assetId') || undefined;
  const driverId = searchParams.get('driverId') || undefined;
  const fuelType = searchParams.get('fuelType') || undefined;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;
  const showArchived = searchParams.get('showArchived') === 'true';

  // Check if user has "OWN" view level — scope results to their records only
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, 'fuel.fuel.fuelEntry');
  const createdBy = perms.view === 'OWN' ? user.id : undefined;

  const result = await getAllFuelTransactions(user.currentTenantId, {
    page,
    limit,
    search,
    assetId,
    driverId,
    fuelType,
    startDate,
    endDate,
    showArchived,
    createdBy,
  });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await createFuelTransaction(user.currentTenantId, user.id, body);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
