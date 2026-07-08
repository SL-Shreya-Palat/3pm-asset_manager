/**
 * POST /api/users/import-command — Invite selected Command staff as members.
 * Body: { ids: string[]; roleId?: string }. Owner/admin only; requires an
 * active Command connection. Returns a per-outcome summary.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { resolveConnection, userCanManageConnection } from '@/controller/command-connection';
import { importCommandStaff } from '@/controller/users/command-import';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await userCanManageConnection(user.id, user.currentTenantId))) {
    return NextResponse.json(
      { data: null, error: 'Only the owner or an admin can import staff from Command' },
      { status: 403 },
    );
  }

  const connection = await resolveConnection(user.currentTenantId);
  if (connection.state !== 'connected' || !connection.authTenantId) {
    return NextResponse.json({ data: null, error: 'Connect to Command first' }, { status: 409 });
  }

  let body: { ids?: unknown; roleId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }

  const ids = Array.isArray(body?.ids) ? body.ids.map((v) => String(v)) : [];
  const roleId = body?.roleId ? String(body.roleId) : undefined;
  if (!ids.length) {
    return NextResponse.json(
      { data: null, error: 'Select at least one person to import' },
      { status: 400 },
    );
  }

  const result = await importCommandStaff(
    user.currentTenantId,
    user.id,
    connection.authTenantId,
    ids,
    roleId,
  );
  if (!result.ok) {
    return NextResponse.json({ data: null, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ data: result.summary, error: null });
}
