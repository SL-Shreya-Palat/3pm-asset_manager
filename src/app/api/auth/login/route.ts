/**
 * GET /api/auth/login?returnUrl=/dashboard
 *
 * Redirects the user to the 3pm-auth IdP authorize page.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getLoginUrl } from '@/lib/auth-3pm';

export async function GET(request: NextRequest) {
  const returnUrl = request.nextUrl.searchParams.get('returnUrl') || '/dashboard';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const callbackUrl = `${appUrl}/api/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`;
  const loginUrl = getLoginUrl(callbackUrl);
  return NextResponse.redirect(loginUrl);
}
