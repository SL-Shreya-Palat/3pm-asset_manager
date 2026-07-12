/**
 * GET /api/inspection-submissions/:id — full inspection record (responses +
 * defects) for the history detail view.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize, inTeamScope } from '@/lib/authz';
import { getInspectionSubmissionById } from '@/controller/inspection-submissions';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, 'inspections.inspectionHistory.inspection', 'view');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  const { id } = await context.params;
  const record = await getInspectionSubmissionById(user.currentTenantId, id);
  if (!record) {
    return NextResponse.json({ data: null, error: 'Inspection not found' }, { status: 404 });
  }

  // OWN view scope: only the caller's own submissions (submitter or operator).
  const rec = record as { submittedBy?: string | null; operatorId?: string | null; teamIds?: string[] };
  if (scope === 'OWN' && rec.submittedBy !== user.id && rec.operatorId !== user.id) {
    return NextResponse.json({ data: null, error: 'Inspection not found' }, { status: 404 });
  }
  if (!inTeamScope(teamIds, rec.teamIds)) {
    return NextResponse.json({ data: null, error: 'Inspection not found' }, { status: 404 });
  }

  return NextResponse.json({ data: record, error: null });
}
