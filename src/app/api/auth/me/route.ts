/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user + tenant context.
 * Used by the client-side Zustand store to hydrate session state.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helper';
import { seedSystemRoles } from '@/lib/system-roles';

export async function GET(req: NextRequest) {
  const authUser = await getAuthenticatedUser(req);

  if (!authUser) {
    return NextResponse.json(
      { data: null, error: 'Not authenticated' },
      { status: 401 },
    );
  }

  // Sync system role definitions BEFORE fetching the profile so that
  // getUserTenant() reads up-to-date permissions from the role document.
  if (authUser.currentTenantId && ObjectId.isValid(authUser.currentTenantId) && ObjectId.isValid(authUser.id)) {
    try {
      await seedSystemRoles(
        ObjectId.createFromHexString(authUser.currentTenantId),
        ObjectId.createFromHexString(authUser.id),
      );
    } catch (err) {
      console.error('[auth/me] seedSystemRoles failed:', err);
    }
  }

  const profile = await getUserProfile(authUser.id);

  return NextResponse.json({ data: { user: profile }, error: null });
}
