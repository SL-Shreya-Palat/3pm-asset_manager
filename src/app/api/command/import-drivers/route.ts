/**
 * POST /api/command/import-drivers — import selected Command staff as
 * drivers with linked tenantMembers and invitation emails.
 * Body: { ids: string[] }.
 *
 * Creates/updates driver records, creates user + tenantMember with the
 * Driver role, and sends invitation emails so imported drivers can log
 * in to the mobile app. Returns a per-outcome summary.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  resolveConnection,
  userCanManageConnection,
} from '@/controller/command-connection';
import { importCommandStaffAsDrivers } from '@/controller/command-connection/command-staff-directory';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await userCanManageConnection(user.id, user.currentTenantId))) {
    return NextResponse.json(
      { data: null, error: 'Only the owner or an admin can import Command staff.' },
      { status: 403 },
    );
  }

  const connection = await resolveConnection(user.currentTenantId);
  if (connection.state !== 'connected' || !connection.authTenantId) {
    return NextResponse.json(
      { data: null, error: 'Connect to Command first to import staff.' },
      { status: 409 },
    );
  }

  let ids: string[];
  try {
    const body = await request.json();
    ids = Array.isArray(body?.ids)
      ? body.ids.filter((x: unknown): x is string => typeof x === 'string')
      : [];
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }

  if (!ids.length) {
    return NextResponse.json(
      { data: null, error: 'Select at least one person to import.' },
      { status: 400 },
    );
  }

  try {
    const res = await importCommandStaffAsDrivers(
      user.currentTenantId,
      user.id,
      connection.authTenantId,
      ids,
    );
    if (!res.ok) {
      return NextResponse.json({ data: null, error: res.error }, { status: res.status });
    }
    return NextResponse.json({ data: res.summary, error: null });
  } catch (err) {
    console.error('Command staff import (drivers) error', err);
    return NextResponse.json(
      { data: null, error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
