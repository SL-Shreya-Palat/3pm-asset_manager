/**
 * GET /api/auth/callback?guid=xxx&returnUrl=/dashboard
 *
 * 3pm-auth redirects here after the user authenticates on the IdP.
 * Exchanges the short-lived GUID (60s) for a JWT, auto-provisions local
 * user/tenant/tenantMember records, and sets the session cookies.
 *
 * Supports two invitation flows:
 * - 3PM flow (new): invitation created via Data API, detected by
 *   getPending3PMInviteByEmail(). Mirrors construction-portal pattern.
 * - Legacy flow: invitation accepted via /invite/accept page, detected by
 *   getAcceptedInvitationByEmail(). Kept for backward compatibility.
 */
import { NextRequest, NextResponse } from 'next/server';
import { exchangeToken, SESSION_COOKIE, TENANT_COOKIE } from '@/lib/auth-3pm';
import { ensureLocalRecords } from '@/lib/provisioning';
import {
  getAcceptedInvitationByEmail,
  completeInvitation,
  getPending3PMInviteByEmail,
  completePending3PMInvitationFromAccept,
} from '@/controller/invitations';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const guid = searchParams.get('guid');
  const returnUrl = searchParams.get('returnUrl') || '/dashboard';

  if (!guid) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  try {
    const { jwt, user, tenant } = await exchangeToken(guid);

    // ── Check for pending invitations ────────────────────────────────
    // 3PM flow: invitation created via Data API (status: 'invited')
    let pending3PMInvite = null;
    try {
      pending3PMInvite = await getPending3PMInviteByEmail(user.email);
    } catch (err) {
      console.warn('[callback] Pending 3PM invite lookup failed:', err);
    }

    // Legacy flow: invitation accepted via /invite/accept page (status: 'accepted')
    let acceptedLegacyInvite = null;
    if (!pending3PMInvite) {
      acceptedLegacyInvite = await getAcceptedInvitationByEmail(user.email);
    }

    const hasPendingInvite = !!(pending3PMInvite || acceptedLegacyInvite);
    const invitedTenantId = pending3PMInvite?.tenantId?.toString()
      ?? acceptedLegacyInvite?.tenantId?.toString();
    const invitedRoleId = pending3PMInvite?.roleId?.toString()
      ?? acceptedLegacyInvite?.roleId?.toString();

    // ── Provision local records ──────────────────────────────────────
    // When an invitation exists, pass invitedTenantId so provisioning
    // skips the owner tenant sync (prevents personal tenant creation).
    const provisioned = await ensureLocalRecords({
      user,
      tenant,
      ...(hasPendingInvite
        ? { invitedTenantId, invitedRoleId }
        : {}),
    });

    // ── Complete the invitation ──────────────────────────────────────
    let completedTenantId: string | null = null;

    if (pending3PMInvite && provisioned) {
      // 3PM flow: activate tenantMember + mark invitation accepted
      try {
        const localUserId = provisioned.localUserId.toString();
        const invTenantId = pending3PMInvite.tenantId.toString();
        const result = await completePending3PMInvitationFromAccept(
          localUserId,
          invTenantId,
          user.email,
        );
        if (result.completed) {
          completedTenantId = invTenantId;
        }
      } catch (err) {
        console.error('[callback] Complete 3PM invite error:', err);
      }
    } else if (acceptedLegacyInvite && provisioned) {
      // Legacy flow: mark invitation as completed
      await completeInvitation(acceptedLegacyInvite._id.toString());
      completedTenantId = acceptedLegacyInvite.tenantId.toString();
    }

    // ── Set cookies ──────────────────────────────────────────────────
    const response = NextResponse.redirect(new URL(returnUrl, request.url));

    // Session cookie (JWT from 3pm-auth)
    response.cookies.set(SESSION_COOKIE, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    // Tenant cookie — prefer invited tenant when user just accepted an invitation.
    // resolveCurrentTenantFor3PM() expects a local ObjectId in this cookie.
    const tenantCookieValue =
      completedTenantId
      ?? provisioned?.localTenantId?.toString()
      ?? tenant?.id
      ?? null;

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
