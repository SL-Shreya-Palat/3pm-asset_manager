/**
 * GET  /api/driver-wellness -- List wellness checks (or summary when ?view=summary)
 * POST /api/driver-wellness -- Create a new wellness check
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  getAllWellnessChecks,
  getDriverWellnessSummary,
  createWellnessCheck,
} from '@/controller/driver-wellness';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;

  // Summary-only mode for stat cards
  if (searchParams.get('view') === 'summary') {
    const summary = await getDriverWellnessSummary(user.currentTenantId);
    return NextResponse.json({ data: summary, error: null });
  }

  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const search = searchParams.get('search') || undefined;
  const result = searchParams.get('result') || undefined;

  const data = await getAllWellnessChecks(user.currentTenantId, { page, limit, search, result });
  return NextResponse.json({ data, error: null });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await createWellnessCheck(user.currentTenantId, user.id, body);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
