/**
 * GET /api/auth/switch-account?next=<absolute url>
 *
 * Forces a full re-authentication as a DIFFERENT account than the one currently
 * signed in. Needed by the invitation flow: when an invited user (User B) opens
 * an invite link while another user (User A) is still signed in, the IdP's
 * /authorize page silently reuses User A's session and never prompts User B.
 *
 * To let the invited user sign in as themselves we must clear BOTH sessions:
 *   1. this app's `session` / `current_tenant_id` cookies, and
 *   2. the IdP's own session cookie (via the IdP sign-out endpoint).
 *
 * After the IdP clears its cookie it redirects to `next`, which re-enters the
 * invite login with no active session — so the invited user is prompted to
 * authenticate instead of being silently logged in as someone else.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSignOutUrl } from '@/lib/auth-3pm';
import { getAppUrl, getRequestOrigin } from '@/lib/app-url';

/** Only allow returning to our own app or the trusted IdP (no open redirect). */
function isSafeNext(next: string, appUrl: string, idpUrl: string): boolean {
  try {
    const target = new URL(next).origin;
    const allowed = [appUrl, idpUrl]
      .filter(Boolean)
      .map((u) => {
        try {
          return new URL(u).origin;
        } catch {
          return null;
        }
      });
    return allowed.includes(target);
  } catch {
    return false;
  }
}

function clearCookiesOnResponse(response: NextResponse) {
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
    path: '/',
  };
  response.cookies.set('session', '', opts);
  response.cookies.set('current_tenant_id', '', opts);
}

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl(getRequestOrigin(request));
  const idpUrl = process.env.IDP_URL || '';

  const rawNext = request.nextUrl.searchParams.get('next');
  // Land back on the invite flow (or IdP login) after both sessions are cleared.
  // Fall back to the dashboard, where middleware will trigger a fresh login.
  const next =
    rawNext && isSafeNext(rawNext, appUrl, idpUrl) ? rawNext : `${appUrl}/dashboard`;

  const signOutUrl = getSignOutUrl(next);

  const response = NextResponse.redirect(signOutUrl);
  clearCookiesOnResponse(response);
  return response;
}
