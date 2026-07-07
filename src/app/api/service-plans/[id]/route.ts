/**
 * GET    /api/service-plans/[id]  -- get one plan
 * PATCH  /api/service-plans/[id]  -- update (name / schedules / tasks)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getServicePlanById, updateServicePlan } from '@/controller/service-plans';
import { getFormPermissionLevels } from '@/lib/server-permissions';

const FORM_ID = 'maintenance.servicePlans.servicePlan';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await context.params;
  const plan = await getServicePlanById(user.currentTenantId, id);
  if (!plan) return NextResponse.json({ data: null, error: 'Service plan not found' }, { status: 404 });

  // "OWN" view: block access to records the user didn't create
  const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
  if (perms.view === 'OWN' && plan.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Service plan not found' }, { status: 404 });
  }

  return NextResponse.json({ data: plan, error: null });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    // "OWN" edit: verify the user created this service plan
    const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
    if (perms.edit === 'OWN') {
      const existing = await getServicePlanById(user.currentTenantId, id);
      if (!existing) {
        return NextResponse.json({ data: null, error: 'Service plan not found' }, { status: 404 });
      }
      if (existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit service plans you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updateServicePlan(user.currentTenantId, user.id, id, body);
    if (result.error) {
      const status = result.error === 'Service plan not found' ? 404 : 400;
      return NextResponse.json({ data: null, error: result.error }, { status });
    }
    return NextResponse.json({ data: result.data, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
