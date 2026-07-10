/**
 * GET    /api/service-plans/[id]  -- get one plan
 * PATCH  /api/service-plans/[id]  -- update (name / schedules / tasks)
 * DELETE /api/service-plans/[id]  -- permanently delete a plan
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServicePlanById, updateServicePlan, deleteServicePlan } from '@/controller/service-plans';
import { authorize } from '@/lib/authz';

const FORM_ID = 'maintenance.servicePlans.servicePlan';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { id } = await context.params;
  const plan = await getServicePlanById(user.currentTenantId!, id);
  if (!plan) return NextResponse.json({ data: null, error: 'Service plan not found' }, { status: 404 });

  if (scope === 'OWN' && plan.createdBy !== user.id) {
    return NextResponse.json({ data: null, error: 'Service plan not found' }, { status: 404 });
  }

  return NextResponse.json({ data: plan, error: null });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { id } = await context.params;
  try {
    // "OWN" edit: verify the user created this service plan
    if (scope === 'OWN') {
      const existing = await getServicePlanById(user.currentTenantId!, id);
      if (!existing || existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only edit service plans you created' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = await updateServicePlan(user.currentTenantId!, user.id, id, body);
    if (result.error) {
      const status = result.error === 'Service plan not found' ? 404 : 400;
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
  const { user, scope } = auth.ctx;

  const { id } = await context.params;

  // "OWN" delete: verify the user created this service plan
  if (scope === 'OWN') {
    const existing = await getServicePlanById(user.currentTenantId!, id);
    if (!existing || existing.createdBy !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only delete service plans you created' }, { status: 403 });
    }
  }

  const deleted = await deleteServicePlan(user.currentTenantId!, id);
  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Service plan not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
