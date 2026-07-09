/**
 * PATCH /api/service-plans/[id]/archive -- { archived: boolean }
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { archiveServicePlan, getServicePlanById } from '@/controller/service-plans';

const FORM_ID = 'maintenance.servicePlans.servicePlan';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'archive');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  const { id } = await context.params;
  try {
    const body = (await request.json()) as { archived?: unknown };
    if (typeof body.archived !== 'boolean') {
      return NextResponse.json({ data: null, error: "'archived' (boolean) is required" }, { status: 400 });
    }

    if (scope === 'OWN') {
      const existing = await getServicePlanById(user.currentTenantId!, id);
      if (!existing || existing.createdBy !== user.id) {
        return NextResponse.json({ data: null, error: 'You can only archive records you created' }, { status: 403 });
      }
    }

    const ok = await archiveServicePlan(user.currentTenantId!, user.id, id, body.archived);
    return NextResponse.json({ data: { updated: ok }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
