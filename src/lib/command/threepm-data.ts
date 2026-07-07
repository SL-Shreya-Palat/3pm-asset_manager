/**
 * 3PM Auth Data API client (server-side only) — subscription/entitlement checks.
 *
 * Answers "does this tenant have an ACTIVE subscription to Command?"
 * independently of whether Command itself is reachable. Uses Asset Manager's
 * existing DATA_API_KEY (subscriptions:read scope) against the 3PM IdP.
 *
 * Reliability rule: a check that can't complete returns `{ ok: false }` =
 * "unknown" — callers must treat that as "keep last-known state", never as
 * "unsubscribed". Only a definitive `{ ok: true, entitled: false }` revokes.
 */

const TIMEOUT_MS = 5_000;

function baseConfig(): { idpUrl: string; apiKey: string } | null {
  const idpUrl = process.env.IDP_URL;
  const apiKey = process.env.DATA_API_KEY;
  if (!idpUrl || !apiKey) return null;
  return { idpUrl: idpUrl.replace(/\/+$/, ''), apiKey };
}

/**
 * Core: does `authTenantId` have an ACTIVE subscription to `clientId`?
 * `{ ok: true, entitled }` on a definitive answer; `{ ok: false }` when the
 * check couldn't be made (network/timeout/misconfig) → caller treats as unknown.
 */
export async function tenantSubscribesToApp(
  authTenantId: string,
  clientId: string,
): Promise<{ ok: true; entitled: boolean } | { ok: false }> {
  const cfg = baseConfig();
  if (!cfg || !authTenantId || !clientId) return { ok: false };

  const url =
    `${cfg.idpUrl}/api/data/subscriptions` +
    `?tenantId=${encodeURIComponent(authTenantId)}` +
    `&clientId=${encodeURIComponent(clientId)}` +
    `&status=active&limit=1`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'X-API-Key': cfg.apiKey },
      signal: ac.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false };

    const body = await res.json();
    // Robust to envelope shape: find the subscriptions array, or a total count.
    const d = body?.data ?? body;
    let count = 0;
    if (Array.isArray(d)) count = d.length;
    else if (d && typeof d === 'object') {
      const arr = Object.values(d).find((v) => Array.isArray(v)) as unknown[] | undefined;
      if (arr) count = arr.length;
      const total = (d as { pagination?: { total?: number } }).pagination?.total;
      if (typeof total === 'number') count = total;
    }
    return { ok: true, entitled: count > 0 };
  } catch {
    clearTimeout(timer);
    return { ok: false };
  }
}

/** Is the tenant subscribed to the Command app? (drives the Command connection) */
export async function tenantSubscribesToCommand(
  authTenantId: string,
): Promise<{ ok: true; entitled: boolean } | { ok: false }> {
  const clientId = process.env.COMMAND_APP_CLIENT_ID;
  if (!clientId) return { ok: false };
  return tenantSubscribesToApp(authTenantId, clientId);
}
