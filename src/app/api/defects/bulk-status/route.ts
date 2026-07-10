/**
 * PUT /api/defects/bulk-status -- Bulk update defect statuses
 * Body: { ids: string[], status: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { bulkUpdateDefectStatus } from '@/controller/defects';

export async function PUT(request: NextRequest) {
  const auth = await authorize(request, 'maintenance.defects.defect', 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  try {
    const body = await request.json();
    const { ids, status } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ data: null, error: 'IDs array is required' }, { status: 400 });
    }

    if (!status || typeof status !== 'string') {
      return NextResponse.json({ data: null, error: 'Status is required' }, { status: 400 });
    }

    const result = await bulkUpdateDefectStatus(
      user.currentTenantId!,
      user.id,
      ids,
      status,
      { createdBy: scope === 'OWN' ? user.id : undefined, teamIds: teamIds ?? undefined },
    );

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
