/**
 * GET  /api/service-plans  -- list plans (paginated, search, showArchived)
 * POST /api/service-plans  -- create a plan (with grouped schedules)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getAllServicePlans, createServicePlan } from '@/controller/service-plans';
import { getFormPermissionLevels } from '@/lib/server-permissions';

const FORM_ID = 'maintenance.servicePlans.servicePlan';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = request.nextUrl;

  // Check if user has "OWN" view level — scope results to their records only
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  const createdBy = perms.view === 'OWN' ? user.id : undefined;

  const result = await getAllServicePlans(user.currentTenantId, {
    page: parseInt(searchParams.get('page') || '1', 10),
    limit: parseInt(searchParams.get('limit') || '25', 10),
    search: searchParams.get('search') || undefined,
    showArchived: searchParams.get('showArchived') === 'true',
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
    const result = await createServicePlan(user.currentTenantId, user.id, body);
    if (result.error) return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
