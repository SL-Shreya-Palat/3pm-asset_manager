/**
 * GET  /api/users -- List tenant members with pagination/search
 * POST /api/users -- Invite a user (create users + tenantMembers records)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { getAllTenantMembers, inviteUser } from '@/controller/users';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.res;
  const user = auth.user;

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '25', 10);
  const search = searchParams.get('search') || undefined;
  const teamId = searchParams.get('teamId') || undefined;
  const showArchived = searchParams.get('showArchived') === 'true';

  const result = await getAllTenantMembers(user.currentTenantId!, { page, limit, search, teamId, showArchived });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.res;
  const user = auth.user;

  try {
    const body = await request.json();
    const result = await inviteUser(user.currentTenantId!, user.id, body);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
