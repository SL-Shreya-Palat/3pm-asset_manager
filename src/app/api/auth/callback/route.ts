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
import { exchangeToken, getLoginUrl, SESSION_COOKIE, TENANT_COOKIE } from '@/lib/auth-3pm';
import { ensureLocalRecords } from '@/lib/provisioning';
import {
  getAcceptedInvitationByEmail,
  completeInvitation,
  getPending3PMInviteByEmail,
  completePending3PMInvitationFromAccept,
  validateInvitationToken,
  acceptInvitation,
} from '@/controller/invitations';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const guid = searchParams.get('guid');
  const returnUrl = searchParams.get('returnUrl') || '/dashboard';
  // Set by the invitation flow: the email the invited user is expected to
  // authenticate as. Used to detect IdP session bleed-through (see guard below).
  const expectedEmail = searchParams.get('expectedEmail');
  // Legacy invitation token — the invitation is marked accepted here, AFTER
  // the authenticated email is verified, never before authentication.
  const inviteToken = searchParams.get('inviteToken');
  const reauthTried = searchParams.get('reauthTried') === '1';

  if (!guid) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  try {
    const { jwt, user, tenant } = await exchangeToken(guid);

    // ── Guard: enforce the invited user is the one who authenticated ─────
    // When an invite link is opened while another user is still signed in on
    // the IdP, /authorize silently reuses that session and returns the WRONG
    // user. Detect the mismatch and force a fresh login as the invited user
    // instead of signing the wrong account into the invited tenant.
    if (
      expectedEmail &&
      user.email.toLowerCase().trim() !== expectedEmail.toLowerCase().trim()
    ) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

      if (!reauthTried) {
        // Re-initiate the invited login once, after clearing local + IdP
        // sessions. NOTE: do NOT set session cookies for the wrong user here.
        const retryCallback =
          `${appUrl}/api/auth/callback` +
          `?returnUrl=${encodeURIComponent(returnUrl)}` +
          `&expectedEmail=${encodeURIComponent(expectedEmail)}` +
          (inviteToken ? `&inviteToken=${encodeURIComponent(inviteToken)}` : '') +
          `&reauthTried=1`;
        const loginUrl = getLoginUrl(retryCallback);
        const switchUrl = `${appUrl}/api/auth/switch-account?next=${encodeURIComponent(loginUrl)}`;
        return NextResponse.redirect(switchUrl);
      }

      // Already retried once and still the wrong account — surface a clear
      // message rather than looping or logging in the wrong person. The
      // invitation was never marked accepted, so its link remains usable.
      const mismatchUrl = new URL('/invite/accept?error=account-mismatch', appUrl);
      if (inviteToken) mismatchUrl.searchParams.set('token', inviteToken);
      return NextResponse.redirect(mismatchUrl);
    }

    // ── Check for pending invitations ────────────────────────────────
    const normalizedUserEmail = user.email.toLowerCase().trim();

    // Legacy flow (token): the user arrived via /invite/accept?token=xxx.
    // Now that they are authenticated AND the email guard passed, verify the
    // token still matches a pending invitation for THIS email and mark it
    // accepted. Anything else (expired, consumed, different email) is ignored.
    let acceptedLegacyInvite = null;
    if (inviteToken) {
      const tokenInvite = await validateInvitationToken(inviteToken);
      if (tokenInvite && tokenInvite.email === normalizedUserEmail) {
        await acceptInvitation(inviteToken);
        acceptedLegacyInvite = tokenInvite;
      }
    }

    // 3PM flow: invitation created via Data API (status: 'invited')
    let pending3PMInvite = null;
    if (!acceptedLegacyInvite) {
      try {
        pending3PMInvite = await getPending3PMInviteByEmail(user.email);
      } catch (err) {
        console.warn('[callback] Pending 3PM invite lookup failed:', err);
      }
    }

    // Legacy flow (fallback): invitation already marked 'accepted' by an
    // earlier visit — completes on the invited user's next login.
    if (!acceptedLegacyInvite && !pending3PMInvite) {
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
