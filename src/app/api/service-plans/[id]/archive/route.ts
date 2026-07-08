/**
 * PATCH /api/service-plans/[id]/archive -- { archived: boolean }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { archiveServicePlan, getServicePlanById } from '@/controller/service-plans';
import { getFormPermissionLevels } from '@/lib/server-permissions';

const FORM_ID = 'maintenance.servicePlans.servicePlan';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const body = (await request.json()) as { archived?: unknown };
    if (typeof body.archived !== 'boolean') {
      return NextResponse.json({ data: null, error: "'archived' (boolean) is required" }, { status: 400 });
    }

    // "OWN" archive: verify the user created this service plan
    const perms = await getFormPermissionLevels(user.id, user.currentTenantId, FORM_ID);
    if (perms.archive === 'OWN') {
      const existing = await getServicePlanById(user.currentTenantId, id);
      if (!existing) {
        return NextResponse.json({ data: null, error: 'Service plan not found' }, { status: 404 });
      }
      if (existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only archive service plans you created' }, { status: 403 });
      }
    }

    const ok = await archiveServicePlan(user.currentTenantId, user.id, id, body.archived);
    return NextResponse.json({ data: { updated: ok }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
