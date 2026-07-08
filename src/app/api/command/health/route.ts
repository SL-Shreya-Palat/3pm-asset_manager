/**
 * GET /api/command/health — Command connection diagnostics: the resolved
 * connection state (entitlement + reachability) plus the per-tenant circuit
 * breaker snapshot. Read-only; any authenticated tenant user may call it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { isCommandConfigured, getCircuitState } from '@/lib/command/client';
import { resolveConnection } from '@/controller/command-connection';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  // Force a live re-check (entitlement + ping) — this is the diagnostics path.
  const connection = await resolveConnection(user.currentTenantId, { force: true });
  return NextResponse.json({
    data: {
      ...connection,
      configured: isCommandConfigured(),
      circuit: getCircuitState(connection.authTenantId),
    },
    error: null,
  });
}
