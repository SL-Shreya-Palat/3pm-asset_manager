/**
 * GET /api/defects/summary — headline exception counts for the Exception Report.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getDefectSummary } from '@/controller/defects';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, 'maintenance.defects.defect', 'view');
  if (!auth.ok) return auth.res;
  const { user, teamIds } = auth.ctx;

  const result = await getDefectSummary(user.currentTenantId!, { teamIds: teamIds ?? undefined });
  return NextResponse.json({ data: result, error: null });
}
