/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user + tenant context.
 * Used by the client-side Zustand store to hydrate session state.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helper';

export async function GET(req: NextRequest) {
  const authUser = await getAuthenticatedUser(req);

  if (!authUser) {
    return NextResponse.json(
      { data: null, error: 'Not authenticated' },
      { status: 401 },
    );
  }

  const profile = await getUserProfile(authUser.id);

  // Surface tenant resolution status so the client can distinguish a genuine
  // "no organization" / "deactivated" state from a still-loading one, and show
  // an actionable screen instead of an infinite loader. `authUser.tenantStatus`
  // is set by resolveCurrentTenantFor3PM (web sessions); default to a value
  // derived from the resolved profile for the non-web auth branches.
  const tenantStatus =
    (authUser as { tenantStatus?: 'active' | 'deactivated' | 'none' }).tenantStatus ??
    (profile?.tenant ? 'active' : 'none');

  return NextResponse.json({
    data: { user: profile ? { ...profile, tenantStatus } : profile },
    error: null,
  });
}
