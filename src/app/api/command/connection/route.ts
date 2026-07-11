/**
 * GET  /api/command/connection -- Current Command connection state (+ impact)
 * POST /api/command/connection -- { action: 'connect' | 'disconnect' | 'recheck' }
 *
 * Owner / full-access roles only (connection is a tenant-level switch).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { isCommandConfigured } from '@/lib/command/client';
import {
  resolveConnection,
  setConnectionDisabled,
  getDisconnectImpact,
  userCanManageConnection,
} from '@/controller/command-connection';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  // Impact counts (4 countDocuments) only when explicitly requested — the
  // settings panel's disconnect dialog is the sole consumer. Every page load
  // hits this route via useConnection, so the default path must stay cheap.
  const wantImpact = request.nextUrl.searchParams.get('impact') === '1';
  const [connection, impact] = await Promise.all([
    resolveConnection(user.currentTenantId),
    wantImpact ? getDisconnectImpact(user.currentTenantId) : Promise.resolve(undefined),
  ]);

  return NextResponse.json({
    data: { ...connection, configured: isCommandConfigured(), ...(impact ? { impact } : {}) },
    error: null,
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await userCanManageConnection(user.id, user.currentTenantId))) {
    return NextResponse.json(
      { data: null, error: 'Only the owner or an admin can manage the Command connection' },
      { status: 403 },
    );
  }

  let action: string;
  try {
    const body = await request.json();
    action = String(body?.action ?? '');
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }

  if (action === 'connect') {
    await setConnectionDisabled(user.currentTenantId, false);
  } else if (action === 'disconnect') {
    await setConnectionDisabled(user.currentTenantId, true);
  } else if (action !== 'recheck') {
    return NextResponse.json({ data: null, error: 'Unknown action' }, { status: 400 });
  }

  const connection = await resolveConnection(user.currentTenantId, { force: true });
  return NextResponse.json({
    data: { ...connection, configured: isCommandConfigured() },
    error: null,
  });
}
