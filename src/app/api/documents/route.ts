/**
 * GET  /api/documents?scope=&assetId=&driverId=&teamId= — list documents for an owner
 * POST /api/documents — create a document
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { listDocuments, createDocument } from '@/controller/documents';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const result = await listDocuments(user.currentTenantId, {
    scope: searchParams.get('scope') || undefined,
    assetId: searchParams.get('assetId') || undefined,
    driverId: searchParams.get('driverId') || undefined,
    teamId: searchParams.get('teamId') || undefined,
  });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await createDocument(user.currentTenantId, user.id, body);
    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
