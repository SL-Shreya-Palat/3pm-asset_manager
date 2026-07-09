/**
 * GET  /api/documents?scope=&assetId=&driverId=&teamId= — list documents for an owner
 * POST /api/documents — create a document
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize, requireAdmin } from '@/lib/authz';
import { listDocuments, createDocument } from '@/controller/documents';

/** Map document scope to the parent entity's form ID for authorization. */
const SCOPE_FORM_MAP: Record<string, string> = {
  asset: 'assets.assets.asset',
  driver: 'people.drivers.driver',
  team: 'people.teams.team',
};

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get('scope') || '';
  const formId = SCOPE_FORM_MAP[scope] || SCOPE_FORM_MAP.asset;

  const auth = await authorize(request, formId, 'view');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const { searchParams } = request.nextUrl;
  const result = await listDocuments(user.currentTenantId, {
    scope: scope || undefined,
    assetId: searchParams.get('assetId') || undefined,
    driverId: searchParams.get('driverId') || undefined,
    teamId: searchParams.get('teamId') || undefined,
  });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.res;
  const user = auth.user;

  try {
    const body = await request.json();
    const result = await createDocument(user.currentTenantId!, user.id, body);
    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
