/**
 * GET /api/command/staff-directory — Command staff annotated with their
 * local membership/invitation/driver status, for the "Import from Command"
 * picker in both Users and Drivers pages.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { resolveConnection } from '@/controller/command-connection';
import { commandStaffDirectory } from '@/controller/command-connection/command-staff-directory';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const connection = await resolveConnection(user.currentTenantId);
  if (connection.state !== 'connected' || !connection.authTenantId) {
    return NextResponse.json(
      { data: null, error: 'Connect to Command first to browse staff.' },
      { status: 409 },
    );
  }

  try {
    const res = await commandStaffDirectory(user.currentTenantId, connection.authTenantId);
    if (!res.ok) {
      return NextResponse.json({ data: null, error: res.error }, { status: res.status });
    }
    return NextResponse.json({ data: { items: res.items }, error: null });
  } catch (err) {
    console.error('Command staff directory error', err);
    return NextResponse.json(
      { data: null, error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
