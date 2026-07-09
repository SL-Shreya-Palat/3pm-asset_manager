/**
 * GET  /api/service-plans  -- list plans (paginated, search, showArchived)
 * POST /api/service-plans  -- create a plan (with grouped schedules)
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getAllServicePlans, createServicePlan } from '@/controller/service-plans';

const FORM_ID = 'maintenance.servicePlans.servicePlan';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;
  const createdBy = scope === 'OWN' ? user.id : undefined;

  const { searchParams } = request.nextUrl;

  const result = await getAllServicePlans(user.currentTenantId!, {
    page: parseInt(searchParams.get('page') || '1', 10),
    limit: parseInt(searchParams.get('limit') || '25', 10),
    search: searchParams.get('search') || undefined,
    showArchived: searchParams.get('showArchived') === 'true',
    createdBy,
  });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const body = await request.json();
    const result = await createServicePlan(user.currentTenantId!, user.id, body);
    if (result.error) return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
