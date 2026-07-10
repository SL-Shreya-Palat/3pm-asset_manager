/**
 * GET  /api/defects -- List defects with pagination/search/status filter
 * POST /api/defects -- Create a new defect
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getAllDefects, createDefect } from '@/controller/defects';

const FORM_ID = 'maintenance.defects.defect';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'view');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;
  const createdBy = scope === 'OWN' ? user.id : undefined;

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const search = searchParams.get('search') || undefined;
  const status = searchParams.get('status') || undefined;
  const priority = searchParams.get('priority') || undefined;
  const severity = searchParams.get('severity') || undefined;
  const teamId = searchParams.get('teamId') || undefined;
  const assetId = searchParams.get('assetId') || undefined;
  const source = searchParams.get('source') || undefined;
  const showArchived = searchParams.get('showArchived') === 'true';

  const result = await getAllDefects(user.currentTenantId!, { page, limit, search, status, priority, severity, teamId, assetId, source, showArchived, createdBy, teamIds: teamIds ?? undefined });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const body = await request.json();
    const result = await createDefect(user.currentTenantId!, user.id, body);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
