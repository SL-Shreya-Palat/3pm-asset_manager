/**
 * 3pm-auth integration — SSO redirect, GUID exchange, session verification.
 * Mirrors the pattern expected by construction-portal's proxy.ts and auth-helper.ts.
 */
import { cookies } from 'next/headers';

const IDP_URL = process.env.IDP_URL!;
const AUTH_CLIENT_ID = process.env.AUTH_CLIENT_ID!;
const AUTH_CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET!;

export const SESSION_COOKIE = 'session';
export const TENANT_COOKIE = 'current_tenant_id';

/** Session user shape returned by 3pm-auth verify-token. */
export interface UserSession {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profilePicUrl?: string;
  tenantId?: string;
  tenantName?: string;
  tenantSlug?: string;
  tenantRole?: 'owner' | 'admin' | 'member';
}

/** Build the 3pm-auth login URL that the middleware redirects to. */
export function getLoginUrl(callbackUrl: string): string {
  const url = new URL('/authorize', IDP_URL);
  url.searchParams.set('clientId', AUTH_CLIENT_ID);
  url.searchParams.set('next', callbackUrl);
  return url.toString();
}

/** Build the 3pm-auth sign-out URL. */
export function getSignOutUrl(returnUrl: string): string {
  const url = new URL('/api/signout', IDP_URL);
  url.searchParams.set('redirect', returnUrl);
  return url.toString();
}

/**
 * Exchange a short-lived GUID for a JWT + user data.
 * Called from the /api/auth/callback route after the IdP redirect.
 */
export async function exchangeToken(guid: string): Promise<{
  jwt: string;
  user: UserSession;
  tenant?: { id: string; name: string; slug: string; role: string };
}> {
  const res = await fetch(`${IDP_URL}/api/exchange-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guid,
      clientId: AUTH_CLIENT_ID,
      clientSecret: AUTH_CLIENT_SECRET,
    }),
  });

  const result = await res.json();

  if (!res.ok || result.error) {
    throw new Error(result.error || 'Token exchange failed');
  }

  return {
    jwt: result.data.jwt,
    user: result.data.user,
    tenant: result.data.tenant,
  };
}

/**
 * Short-lived cache of verified sessions, keyed by the raw session-cookie value.
 *
 * getSession() runs on every route handler, and a single page load fires a burst
 * of parallel requests (list fetches + the notification poll + the SSE stream +
 * RSC prefetches). Without caching, each one blocks on its own IdP verify-token
 * round-trip, and under that load some fail → getSession() returns null → spurious
 * 401s (and the overloaded dev server drops RSC payloads). Caching dedupes the
 * verify so the first success covers the whole burst.
 *
 * Only SUCCESSFUL verifies are cached — a transient IdP failure recovers on the
 * next request instead of locking the user out for the TTL. On logout the cookie
 * is cleared, so the no-cookie fast path below bypasses the cache entirely.
 */
const SESSION_CACHE_TTL_MS = 5 * 60_000;
const sessionCache = new Map<string, { session: UserSession; expiresAt: number }>();

/**
 * In-flight verify dedupe: a cold page load fires 7-9 parallel API calls
 * BEFORE the first verify completes and populates the cache — without this,
 * each of them opened its own IdP round-trip (and if the IdP was cold-starting
 * on Render, they all hung together). All concurrent callers for the same
 * token now share ONE request.
 */
const inflightVerify = new Map<string, Promise<UserSession | null>>();

/**
 * Verify the session cookie against the 3pm-auth IdP.
 * Returns the user session if valid, null otherwise.
 */
export async function getSession(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE);

    if (!sessionCookie?.value) return null;

    const token = sessionCookie.value;
    const now = Date.now();

    // Serve a recent verification without re-hitting the IdP.
    const cached = sessionCache.get(token);
    if (cached && cached.expiresAt > now) return cached.session;

    // Join an already-running verify for this token instead of duplicating it.
    const inflight = inflightVerify.get(token);
    if (inflight) return inflight;

    const verifyPromise = (async (): Promise<UserSession | null> => {
      const res = await fetch(`${IDP_URL}/api/verify-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE}=${token}`,
        },
        body: JSON.stringify({
          token,
          clientId: AUTH_CLIENT_ID,
          clientSecret: AUTH_CLIENT_SECRET,
        }),
      });

      const result = await res.json();

      if (!res.ok || result.error || !result.data?.valid) return null;

      const session = result.data.user as UserSession;

      // Cache the success; prune stale entries opportunistically so the map stays bounded.
      if (sessionCache.size > 500) {
        for (const [key, val] of sessionCache) {
          if (val.expiresAt <= now) sessionCache.delete(key);
        }
      }
      sessionCache.set(token, { session, expiresAt: now + SESSION_CACHE_TTL_MS });

      return session;
    })();

    inflightVerify.set(token, verifyPromise);
    try {
      return await verifyPromise;
    } finally {
      inflightVerify.delete(token);
    }
  } catch (error) {
    console.error('Error verifying 3pm-auth session:', error);
    return null;
  }
}

/** Clear the session and tenant cookies. */
export async function clearAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(TENANT_COOKIE);
}

/**
 * Call 3pm-auth to switch the active tenant.
 * Returns the Set-Cookie header value from the IdP (if any).
 */
export async function call3PMTenantSwitch(
  tenantId: string,
  sessionToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${IDP_URL}/api/tenant/switch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE}=${sessionToken}`,
      },
      body: JSON.stringify({ tenantId }),
    });

    const result = await res.json();
    if (!res.ok || result.error) {
      console.error('3PM tenant switch failed:', result.error);
      return null;
    }

    // Return the Set-Cookie header so the caller can propagate it
    return res.headers.get('set-cookie');
  } catch (error) {
    console.error('Error calling 3PM tenant switch:', error);
    return null;
  }
}

/** Read the session token from cookies (for proxying to IdP). */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

/** The IdP's own session cookie name (used only as a forwarded request header). */
const SESSION_COOKIE_3PM = '3pm_session';

/** One tenant the authenticated user belongs to (from GET /api/tenant/list). */
export interface TenantListItem {
  id: string;
  name: string;
  slug?: string;
  role?: 'owner' | 'admin' | 'member';
  isActive?: boolean;
}

interface TenantListResponse {
  data?: {
    tenants: TenantListItem[];
    activeTenantId?: string;
  } | null;
  error?: string | null;
}

/**
 * Fetch ALL tenants the authenticated user belongs to from 3pm-auth.
 *
 * Token exchange (`exchangeToken`) only returns a SINGLE `tenant` — and only
 * when the user has an active app subscription for THIS clientId at that moment.
 * That single object is absent for e.g. an org whose subscription became active
 * after the JWT was minted, which strands the user with no local tenant. This
 * endpoint returns the full membership list regardless of per-app subscription,
 * so the callback can still provision the user's org(s). Mirrors
 * construction-portal's fetch3PMTenantList (proven in production). Best-effort:
 * returns null on any failure — never throws.
 */
export async function fetch3PMTenantList(
  sessionJwt: string,
): Promise<{ tenants: TenantListItem[]; activeTenantId: string | null } | null> {
  if (!IDP_URL || !sessionJwt) return null;
  try {
    const res = await fetch(`${IDP_URL}/api/tenant/list`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionJwt}`,
        'Content-Type': 'application/json',
        // The IdP's /api/tenant/list authenticates via getCurrentSession(),
        // which reads its own 3pm_session cookie — forward the JWT as that.
        Cookie: `${SESSION_COOKIE_3PM}=${sessionJwt}`,
      },
      cache: 'no-store',
    });
    const result = (await res.json()) as TenantListResponse;
    if (result.error || !result.data?.tenants) return null;
    return {
      tenants: result.data.tenants,
      activeTenantId: result.data.activeTenantId ?? null,
    };
  } catch (err) {
    console.error('[auth-3pm] tenant list fetch failed:', err);
    return null;
  }
}
