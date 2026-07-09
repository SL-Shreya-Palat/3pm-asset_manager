/**
 * GET /api/defects/by-asset — exceptions grouped by asset for the Exception
 * Report's fleet-safety view. Supports status / severity / search filters.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getExceptionsByAsset } from '@/controller/defects';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, 'maintenance.defects.defect', 'view');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const { searchParams } = new URL(request.url);
  const result = await getExceptionsByAsset(user.currentTenantId!, {
    status: searchParams.get('status') || undefined,
    severity: searchParams.get('severity') || undefined,
    search: searchParams.get('search') || undefined,
  });

  return NextResponse.json({ data: result, error: null });
}
