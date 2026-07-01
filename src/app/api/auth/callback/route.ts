/**
 * GET /api/auth/callback?guid=xxx&returnUrl=/dashboard
 *
 * 3pm-auth redirects here after the user authenticates on the IdP.
 * Exchanges the short-lived GUID (60s) for a JWT, auto-provisions local
 * user/tenant/tenantMember records, and sets the session cookies.
 *
 * If the user has an accepted invitation, skip provisioning their personal
 * (owner) tenant and instead activate the pending tenantMember on the
 * invited tenant. This mirrors the construction-portal pattern.
 */
import { NextRequest, NextResponse } from 'next/server';
import { exchangeToken, SESSION_COOKIE, TENANT_COOKIE } from '@/lib/auth-3pm';
import { ensureLocalRecords } from '@/lib/provisioning';
import { getAcceptedInvitationByEmail, completeInvitation } from '@/controller/invitations';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const guid = searchParams.get('guid');
  const returnUrl = searchParams.get('returnUrl') || '/dashboard';

  if (!guid) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  try {
    const { jwt, user, tenant } = await exchangeToken(guid);

    // Check if this user has an accepted invitation (clicked invite link → logged in).
    // If so, skip creating their personal owner tenant and activate the invited tenant instead.
    const acceptedInvitation = await getAcceptedInvitationByEmail(user.email);

    const provisioned = await ensureLocalRecords({
      user,
      tenant,
      // When an accepted invitation exists, pass the invited tenantId
      // so provisioning skips the owner tenant sync
      ...(acceptedInvitation
        ? {
            invitedTenantId: acceptedInvitation.tenantId.toString(),
            invitedRoleId: acceptedInvitation.roleId?.toString(),
          }
        : {}),
    });

    // Mark invitation as completed so it doesn't trigger again on subsequent logins
    if (acceptedInvitation && provisioned) {
      await completeInvitation(acceptedInvitation._id.toString());
    }

    const response = NextResponse.redirect(new URL(returnUrl, request.url));

    // Set session cookie (JWT from 3pm-auth)
    response.cookies.set(SESSION_COOKIE, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    // Set tenant cookie — use LOCAL tenant _id (not the 3pm tenant id).
    // resolveCurrentTenantFor3PM() expects a local ObjectId in this cookie.
    const tenantCookieValue = provisioned?.localTenantId?.toString() ?? tenant?.id ?? null;
    if (tenantCookieValue) {
      response.cookies.set(TENANT_COOKIE, tenantCookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('Auth callback error:', error);
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
}
