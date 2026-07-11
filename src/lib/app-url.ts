/**
 * Public base URL of this deployment — the ONE place absolute self-URLs come
 * from (invite links, emails, auth callback URLs).
 *
 * Order of resolution:
 *   1. NEXT_PUBLIC_APP_URL (set on Render; inlined at build time for client code)
 *   2. A caller-provided origin (e.g. from x-forwarded-host), unless it's a
 *      localhost origin — behind Render's proxy the request origin can resolve
 *      to the internal http://localhost:<port>, which must never leak into
 *      redirects or emails.
 *   3. Dev only: http://localhost:3000.
 *
 * In production with no usable source this THROWS instead of silently
 * producing localhost links — an invite email that fails visibly is fixable;
 * one that quietly points at localhost is a support ticket weeks later.
 */
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i;

export function getAppUrl(fallbackOrigin?: string | null): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  if (configured && !LOCALHOST_RE.test(configured)) return configured;

  const origin = fallbackOrigin?.trim().replace(/\/+$/, '');
  if (origin && !LOCALHOST_RE.test(origin)) return origin;

  if (process.env.NODE_ENV !== 'production') {
    return configured || origin || 'http://localhost:3000';
  }

  throw new Error(
    'NEXT_PUBLIC_APP_URL is not set (or points at localhost) in production. ' +
      'Set it to the public app URL on the deployment and rebuild — refusing ' +
      'to generate a localhost link.',
  );
}

/**
 * Public origin of the CURRENT request, proxy-aware. Prefers the standard
 * forwarded headers (what the user's browser actually hit) over
 * `request.nextUrl.origin`, which self-hosted Next.js can resolve to the
 * internal localhost origin behind a reverse proxy.
 */
export function getRequestOrigin(req: {
  headers: { get(name: string): string | null };
  nextUrl?: { origin?: string };
}): string | null {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (host) {
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;
  }
  return req.nextUrl?.origin ?? null;
}
