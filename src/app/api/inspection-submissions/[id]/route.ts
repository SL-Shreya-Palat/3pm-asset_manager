/**
 * GET /api/inspection-submissions/:id — full inspection record (responses +
 * defects) for the history detail view.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getInspectionSubmissionById } from '@/controller/inspection-submissions';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await context.params;
  const record = await getInspectionSubmissionById(user.currentTenantId, id);
  if (!record) {
    return NextResponse.json({ data: null, error: 'Inspection not found' }, { status: 404 });
  }
  return NextResponse.json({ data: record, error: null });
}
