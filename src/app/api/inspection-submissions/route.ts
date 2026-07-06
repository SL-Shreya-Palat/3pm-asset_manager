/**
 * GET /api/inspection-submissions — paginated inspection history.
 *
 * Inspections are filled in the embedded form-builder and arrive via the
 * form-builder webhook (or the sync fallback), so there's no direct submit here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { listInspectionSubmissions } from '@/controller/inspection-submissions';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.currentTenantId) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const sp = req.nextUrl.searchParams;
    const result = await listInspectionSubmissions(user.currentTenantId, {
      page: sp.get('page') ? parseInt(sp.get('page')!, 10) : undefined,
      limit: sp.get('limit') ? parseInt(sp.get('limit')!, 10) : undefined,
      search: sp.get('search') || undefined,
      result: sp.get('result') || undefined,
      assetId: sp.get('assetId') || undefined,
      teamId: sp.get('teamId') || undefined,
    });
    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    console.error('[INSPECTION_SUBMISSIONS_LIST]', error);
    return NextResponse.json(
      { data: null, error: 'Failed to load inspection history' },
      { status: 500 },
    );
  }
}
