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
    const appUrl = process.env.NODE_ENV === 'development'
      ? process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      : process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    const returnUrl = `${appUrl}${pathname}`;
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
