/**
 * GET  /api/auth/logout — browser redirect (clears cookies, redirects to IdP sign-out)
 * POST /api/auth/logout — programmatic (clears cookies, returns JSON)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSignOutUrl } from '@/lib/auth-3pm';
import { getAppUrl, getRequestOrigin } from '@/lib/app-url';

function clearCookiesOnResponse(response: NextResponse) {
  // Delete by setting maxAge=0 with explicit path to ensure browser removes them
  response.cookies.set('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  response.cookies.set('current_tenant_id', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl(getRequestOrigin(request));
  // After IdP sign-out, come back to app root — middleware will redirect
  // to the IdP authorize page since there's no session cookie.
  const signOutUrl = getSignOutUrl(appUrl);

  const response = NextResponse.redirect(signOutUrl);
  clearCookiesOnResponse(response);
  return response;
}

export async function POST() {
  const response = NextResponse.json({ data: { message: 'Logged out' }, error: null });
  clearCookiesOnResponse(response);
  return response;
}
