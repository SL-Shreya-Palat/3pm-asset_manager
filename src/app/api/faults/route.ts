/**
 * GET  /api/faults -- List faults with pagination/search/status filter
 * POST /api/faults -- Create a new fault
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getAllFaults, createFault } from '@/controller/faults';

const FORM_ID = 'maintenance.faults.fault';

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
  const category = searchParams.get('category') || undefined;
  const priority = searchParams.get('priority') || undefined;
  const severity = searchParams.get('severity') || undefined;
  const teamId = searchParams.get('teamId') || undefined;
  const assetId = searchParams.get('assetId') || undefined;
  const showArchived = searchParams.get('showArchived') === 'true';

  const result = await getAllFaults(user.currentTenantId!, {
    page, limit, search, status, category, priority, severity, teamId, assetId, showArchived, createdBy, teamIds: teamIds ?? undefined,
  });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const body = await request.json();
    const result = await createFault(user.currentTenantId!, user.id, body);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
