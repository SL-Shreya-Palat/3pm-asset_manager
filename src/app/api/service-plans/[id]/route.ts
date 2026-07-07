/**
 * GET    /api/service-plans/[id]  -- get one plan
 * PATCH  /api/service-plans/[id]  -- update (name / schedules / tasks)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getServicePlanById, updateServicePlan } from '@/controller/service-plans';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const plan = await getServicePlanById(user.currentTenantId, id);
  if (!plan) return NextResponse.json({ data: null, error: 'Service plan not found' }, { status: 404 });
  return NextResponse.json({ data: plan, error: null });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  try {
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
