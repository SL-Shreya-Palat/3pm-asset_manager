/**
 * PATCH /api/service-plans/[id]/archive -- { archived: boolean }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { archiveServicePlan } from '@/controller/service-plans';

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
    const body = (await request.json()) as { archived?: unknown };
    if (typeof body.archived !== 'boolean') {
      return NextResponse.json({ data: null, error: "'archived' (boolean) is required" }, { status: 400 });
    }
    const ok = await archiveServicePlan(user.currentTenantId, user.id, id, body.archived);
    return NextResponse.json({ data: { updated: ok }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
