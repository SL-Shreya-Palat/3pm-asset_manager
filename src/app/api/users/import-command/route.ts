/**
 * POST /api/users/import-command — Invite selected Command staff as members
 * with a per-person role choice.
 * Body: { assignments: Array<{ id, roleId }> } (preferred) or the legacy
 * { ids: string[]; roleId?: string }. Owner/admin only; requires an active
 * Command connection. Returns a per-outcome summary. People assigned a Driver
 * role also get a driver profile completed from their Command staff record.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { resolveConnection, userCanManageConnection } from '@/controller/command-connection';
import {
  importCommandStaff,
  type CommandStaffAssignment,
} from '@/controller/users/command-import';

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

  let body: { assignments?: unknown; ids?: unknown; roleId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }

  let assignments: CommandStaffAssignment[] = [];
  if (Array.isArray(body?.assignments)) {
    assignments = body.assignments
      .filter((a): a is { id: unknown; roleId: unknown } => !!a && typeof a === 'object')
      .map((a) => ({ id: String(a.id ?? ''), roleId: String(a.roleId ?? '') }))
      .filter((a) => a.id);
  } else if (Array.isArray(body?.ids)) {
    // Legacy shape: one role for everyone.
    const roleId = body?.roleId ? String(body.roleId) : '';
    assignments = body.ids.map((v) => ({ id: String(v), roleId }));
  }

  if (!assignments.length) {
    return NextResponse.json(
      { data: null, error: 'Select at least one person to import' },
      { status: 400 },
    );
  }

  const result = await importCommandStaff(
    user.currentTenantId,
    user.id,
    connection.authTenantId,
    assignments,
  );
  if (!result.ok) {
    return NextResponse.json({ data: null, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ data: result.summary, error: null });
}
