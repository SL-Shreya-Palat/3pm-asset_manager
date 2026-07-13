/**
 * Asset Manager subscription gate.
 *
 * A local tenant record is provisioned once (on first login) and then lives
 * independently in AM's own database — `tenants.isActive` never changes just
 * because the org's Asset Manager subscription is later cancelled in the 3PM
 * Admin Center. Without this check, an unsubscribed org keeps full access
 * (still shows in the tenant switcher, still resolves as the active tenant on
 * every request) since nothing ever re-verifies against 3PM Auth.
 *
 * Check design mirrors construction-portal's assetManagerGate.ts (same TTL
 * cache + fail-open philosophy), but in the opposite direction: AM checks its
 * OWN clientId's subscription status rather than gating on another app's.
 *
 * Fail-open by design: an unreachable/misconfigured 3PM Auth must never lock
 * every tenant out of the app. Only a DEFINITIVE "not subscribed" response
 * revokes access; anything unknown (network error, missing config, not yet
 * checked) keeps the tenant usable.
 */

import { Document, ObjectId } from 'mongodb';
import { getTenantsCollection } from '@/lib/mongodb';

const TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 5_000;

interface TenantSubscriptionFields extends Document {
  authTenantId?: ObjectId | string;
  amSubscriptionActive?: boolean;
  amSubscriptionCheckedAt?: Date;
}

function gateConfig(): { idpUrl: string; apiKey: string; clientId: string } | null {
  const idpUrl = process.env.IDP_URL;
  const apiKey = process.env.DATA_API_KEY;
  const clientId = process.env.AUTH_CLIENT_ID;
  if (!idpUrl || !apiKey || !clientId) return null;
  return { idpUrl: idpUrl.replace(/\/+$/, ''), apiKey, clientId };
}

/** Definitive subscription answer from 3PM Auth, or null when unknowable. */
async function checkSubscription(authTenantId: string): Promise<boolean | null> {
  const cfg = gateConfig();
  if (!cfg) return null;

  const url =
    `${cfg.idpUrl}/api/data/subscriptions` +
    `?tenantId=${encodeURIComponent(authTenantId)}` +
    `&clientId=${encodeURIComponent(cfg.clientId)}` +
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
    if (!res.ok) return null;

    const body = await res.json();
    const d = body?.data ?? body;
    let count = 0;
    if (Array.isArray(d)) count = d.length;
    else if (d && typeof d === 'object') {
      const arr = Object.values(d).find((v) => Array.isArray(v)) as unknown[] | undefined;
      if (arr) count = arr.length;
      const total = (d as { pagination?: { total?: number } }).pagination?.total;
      if (typeof total === 'number') count = total;
    }
    return count > 0;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Does this tenant currently have an ACTIVE Asset Manager subscription?
 * Cached on the tenant doc (`amSubscriptionActive` + `amSubscriptionCheckedAt`)
 * for TTL_MS so this stays cheap on the hot auth path (called on every request).
 *
 * Defaults to `true` when unconfigured, unverifiable, or not yet checked —
 * only a confirmed negative from 3PM Auth ever revokes access.
 */
export async function hasActiveAmSubscription(tenant: TenantSubscriptionFields): Promise<boolean> {
  if (!gateConfig()) return true;

  const authTenantId = tenant.authTenantId;
  if (!authTenantId) return true;

  const cached = tenant.amSubscriptionActive;
  const checkedAt = tenant.amSubscriptionCheckedAt;
  const fresh = checkedAt != null && Date.now() - new Date(checkedAt).getTime() < TTL_MS;
  if (fresh) return cached ?? true;

  const authTenantIdStr = typeof authTenantId === 'string' ? authTenantId : authTenantId.toString();
  const answer = await checkSubscription(authTenantIdStr);
  if (answer === null) return cached ?? true;

  try {
    const tenantsCollection = await getTenantsCollection();
    await tenantsCollection.updateOne(
      { _id: tenant._id },
      { $set: { amSubscriptionActive: answer, amSubscriptionCheckedAt: new Date() } },
    );
  } catch (err) {
    console.error('[subscription-gate] Failed to cache subscription check:', err);
  }

  return answer;
}
