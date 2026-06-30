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

  return NextResponse.json({ data: { user: profile }, error: null });
}
