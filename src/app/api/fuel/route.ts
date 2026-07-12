/**
 * GET  /api/fuel -- List fuel transactions with pagination/search/filters
 * POST /api/fuel -- Create a new fuel transaction
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getAllFuelTransactions, createFuelTransaction } from '@/controller/fuel';

const FORM_ID = 'fuel.fuel.fuelEntry';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;
  const createdBy = scope === 'OWN' ? user.id : undefined;

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

  const result = await getAllFuelTransactions(user.currentTenantId!, {
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
    teamIds: teamIds ?? undefined,
  });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const body = await request.json();
    const result = await createFuelTransaction(user.currentTenantId!, user.id, body);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
