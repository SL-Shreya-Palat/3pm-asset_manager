/**
 * Edge middleware — protects routes by checking the 3pm-auth session cookie.
 *
 * Unauthenticated users hitting a protected route are redirected to the
 * 3pm-auth IdP /authorize page.
 *
 * Mirrors construction-portal/proxy.ts.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAppUrl, getRequestOrigin } from '@/lib/app-url';

const SESSION_COOKIE = 'session';

/** Routes that require authentication. */
const protectedPrefixes = [
  '/dashboard',
  '/settings',
  '/profile',
  '/assets',
  '/teams',
  '/members',
  '/inspections',
  '/maintenance',
  '/vendors',
  '/fuel',
  '/people',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE);
  const isLoggedIn = !!sessionCookie?.value;

  const idpUrl = process.env.IDP_URL;
  const clientId = process.env.AUTH_CLIENT_ID;

  // --- Protected routes: redirect to IdP if no session ---
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (isProtected && !isLoggedIn && idpUrl && clientId) {
    // Public origin resolution: NEXT_PUBLIC_APP_URL, else the forwarded host
    // headers. Never `request.nextUrl.origin` alone — self-hosted behind
    // Render's proxy it resolves to the internal http://localhost:<port>,
    // which the IdP would then redirect freshly-authenticated users to.
    let appUrl: string;
    try {
      appUrl = getAppUrl(getRequestOrigin(request));
    } catch {
      // No safe public origin available — let the request through (the layout
      // guard still requires auth) rather than redirect to a broken URL.
      return NextResponse.next();
    }

    // Keep the query string so deep links (e.g. QR-scanned
    // /inspections/fill?assetId=X&formId=Y) survive the login round-trip.
    const returnUrl = `${appUrl}${pathname}${request.nextUrl.search}`;
    const callbackUrl = `${appUrl}/api/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`;

    const loginUrl = new URL('/authorize', idpUrl);
    loginUrl.searchParams.set('clientId', clientId);
    loginUrl.searchParams.set('next', callbackUrl);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
