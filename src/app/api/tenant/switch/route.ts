/**
 * POST /api/tenant/switch
 *
 * Switch current tenant for the authenticated user.
 * - Verifies local membership
 * - Sets current_tenant_id cookie (local persistence)
 * - Calls 3PM /api/tenant/switch when tenant has authTenantId
 * - Updates sessions.currentTenantId for mobile users
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, CURRENT_TENANT_ID_COOKIE, ACTIVE_MEMBER_FILTER } from '@/lib/auth-helper';
import { getSessionToken, call3PMTenantSwitch } from '@/lib/auth-3pm';
import { getTenantMembersCollection, getTenantsCollection } from '@/lib/mongodb';
import { updateSessionActivity } from '@/lib/session';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);

  if (!authUser) {
    return NextResponse.json(
      { data: null, error: 'Not authenticated' },
      { status: 401 },
    );
  }

  const { tenantId } = await request.json();

  if (!tenantId || !ObjectId.isValid(tenantId)) {
    return NextResponse.json(
      { data: null, error: 'Invalid or missing tenantId' },
      { status: 400 },
    );
  }

  try {
    const userObjectId = ObjectId.createFromHexString(authUser.id);
    const tenantObjectId = ObjectId.createFromHexString(tenantId);

    const tenantMembersCollection = await getTenantMembersCollection();
    const tenantsCollection = await getTenantsCollection();

    // Verify membership (active, not archived, not still pending acceptance)
    const tenantMember = await tenantMembersCollection.findOne({
      userId: userObjectId,
      tenantId: tenantObjectId,
      ...ACTIVE_MEMBER_FILTER,
    });

    if (!tenantMember) {
      return NextResponse.json(
        { data: null, error: 'You do not have access to this tenant' },
        { status: 403 },
      );
    }

    // Verify tenant is active
    const tenant = await tenantsCollection.findOne({
      _id: tenantObjectId,
      isActive: { $ne: false },
    });

    if (!tenant) {
      return NextResponse.json(
        { data: null, error: 'Tenant is not active' },
        { status: 403 },
      );
    }

    const response = NextResponse.json({
      data: {
        tenantId,
        tenant: {
          id: tenant._id.toString(),
          name: tenant.name,
          logoUrl: tenant.logoUrl || null,
          isActive: tenant.isActive,
        },
      },
      error: null,
    });

    // 1. Set local cookie with LOCAL tenant _id
    response.cookies.set(CURRENT_TENANT_ID_COOKIE, tenantId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });

    // 2. Update mobile session if applicable
    if (authUser.sessionToken) {
      await updateSessionActivity(authUser.sessionToken, tenantId);
    }

    // 3. Call 3PM switch with authTenantId (not local id)
    const authTenantId = (tenant as { authTenantId?: ObjectId }).authTenantId;
    if (authTenantId && !authUser.sessionToken) {
      const sessionToken = await getSessionToken();
      if (sessionToken) {
        const setCookieHeader = await call3PMTenantSwitch(
          authTenantId.toString(),
          sessionToken,
        );
        if (setCookieHeader) {
          response.headers.append('Set-Cookie', setCookieHeader);
        }
      }
    }

    return response;
  } catch (error) {
    console.error('Tenant switch error:', error);
    return NextResponse.json(
      { data: null, error: 'Tenant switch failed' },
      { status: 500 },
    );
  }
}
