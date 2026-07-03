/**
 * GET  /api/assets — List assets with pagination/search/filter
 * POST /api/assets — Create a new asset
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getAllAssets, createAsset } from '@/controller/assets';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const search = searchParams.get('search') || undefined;
  const status = searchParams.get('status') || undefined;
  const teamId = searchParams.get('teamId') || undefined;
  const complianceStatus = searchParams.get('complianceStatus') || undefined;

  const result = await getAllAssets(user.currentTenantId, { page, limit, search, status, teamId, complianceStatus });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await createAsset(user.currentTenantId, user.id, body);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
