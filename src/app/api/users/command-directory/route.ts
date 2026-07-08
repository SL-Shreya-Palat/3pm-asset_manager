/**
 * GET /api/users/command-directory — Command staff annotated with their Asset
 * Manager membership status (member / invited / no email), for the "Import from
 * Command" picker. Owner/admin only; requires an active Command connection.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { resolveConnection, userCanManageConnection } from '@/controller/command-connection';
import { commandStaffDirectory } from '@/controller/users/command-import';

export async function GET(request: NextRequest) {
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

  const result = await commandStaffDirectory(user.currentTenantId, connection.authTenantId);
  if (!result.ok) {
    return NextResponse.json({ data: null, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ data: { items: result.items }, error: null });
}
