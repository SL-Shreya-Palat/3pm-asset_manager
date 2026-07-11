/**
 * Auto-sync-on-read — keeps Command-sourced master data FRESH without a manual
 * "Import from Command" click.
 *
 * Asset Manager is import-and-link (operational data hangs off local `_id`s), so
 * we can't do the dispatch portal's pure read-through. Instead the read paths
 * refresh the local anchor docs from Command on every call:
 *
 *  - LIST reads AWAIT `ensureFreshFromCommand` — each list API call pulls the
 *    latest Command records for that entity, then reads local. So a record added
 *    or changed in Command shows the next time the list loads (dispatch-style:
 *    fresh on every request, no throttle, no manual import).
 *  - The asset DETAIL read awaits `ensureFreshAsset` (a single-record refresh —
 *    one Command GET) so an opened asset is always current.
 *
 * Both no-op when standalone / Command unreachable (the circuit breaker in the
 * transport fails fast) and NEVER throw — a Command outage must never break a
 * local read.
 */

import { getEnabledConnectionAuthTenantId } from './guard';
import { importFromCommand, syncOneAssetFromCommand, type ImportEntity } from './import';

/**
 * On-read auto-sync throttle.
 *
 * A LIST read previously ran a FULL fetch-all + upsert from Command on every
 * single request — including every debounced search keystroke and every
 * pagination click — so a page of local data was gated behind a network
 * round-trip each time. That is the dominant cost of the connected-tenant
 * lists.
 *
 * We keep the "auto-fresh, no manual import" behaviour but coalesce those
 * bursts: a given (tenant, entity) syncs at most once per TTL window, and the
 * requests in between are served straight from the already-fresh local
 * snapshot. Command changes still surface automatically, just within the TTL
 * rather than on literally every request. The manual "Import from Command"
 * button calls `importFromCommand` directly (not this path), so a forced full
 * sync is always available and never throttled.
 *
 * Stored on `globalThis` so the throttle survives dev HMR (same pattern as the
 * Mongo client singleton).
 */
const SYNC_TTL_MS = Number(process.env.COMMAND_SYNC_TTL_MS) || 30_000;

const g = globalThis as typeof globalThis & {
  _amCommandSyncAt?: Map<string, number>;
};
const lastSyncAt: Map<string, number> = (g._amCommandSyncAt ??= new Map());

/**
 * Refresh one master entity from Command — STALE-WHILE-REVALIDATE.
 *
 * Returns immediately; the actual Command fetch + upserts run in the
 * background. List reads therefore ALWAYS serve the local snapshot at local
 * speed, and Command changes land within seconds (visible on the next
 * request/poll). Coalesced to at most one background sync per
 * (tenant, entity) per `SYNC_TTL_MS`.
 *
 * Rationale: awaiting the import inline meant the unlucky request after each
 * TTL expiry stalled for a full fetch-all + upsert round-trip to Command —
 * multi-second list loads that read as "the app is slow". A briefly stale
 * table beats a frozen one; the manual "Import from Command" action remains
 * the synchronous, never-throttled path.
 */
export async function ensureFreshFromCommand(
  tenantId: string,
  userId: string | undefined,
  entity: ImportEntity,
): Promise<void> {
  // Within the TTL window this (tenant, entity) is already fresh — skip the
  // Command round-trip AND the connection-check DB read entirely.
  const key = `${tenantId}:${entity}`;
  const last = lastSyncAt.get(key);
  if (last !== undefined && Date.now() - last < SYNC_TTL_MS) return;
  // Mark now so concurrent/rapid callers in this window also skip (both a
  // success and a failure throttle equally — avoids hammering a down Command).
  lastSyncAt.set(key, Date.now());

  // Deliberately NOT awaited — see doc comment.
  void (async () => {
    try {
      const authTenantId = await getEnabledConnectionAuthTenantId(tenantId);
      if (!authTenantId) return; // standalone / not configured / disabled
      const { summary, errors } = await importFromCommand(
        tenantId,
        userId ?? '',
        authTenantId,
        [entity],
      );
      // importFromCommand catches per-entity failures INTERNALLY and returns
      // them here — surface them, otherwise a failed suppliers/stock sync
      // silently leaves the list empty with no trace (the exact "records not
      // importing" symptom is invisible without this log).
      if (errors[entity]) {
        console.error(`[command-auto-sync] ${entity} import failed:`, errors[entity]);
      } else {
        const c = summary[entity];
        if (c && c.created === 0 && c.updated === 0 && c.skipped === 0) {
          // Fetched OK but nothing landed — e.g. no contacts flagged
          // roles.isSupplier, or an empty Command list. Flag it so this doesn't
          // read as a silent success.
          console.warn(
            `[command-auto-sync] ${entity}: Command returned no importable records (check roles/filters/connection).`,
          );
        }
      }
    } catch (e) {
      console.error('[command-auto-sync] refresh failed for', entity, e);
    }
  })();
}

/**
 * Refresh a SINGLE Command-sourced asset (asset detail view) — same
 * stale-while-revalidate + TTL discipline as the list sync. The detail page
 * renders the local snapshot immediately; the background refresh lands for
 * the next read. Previously this was awaited AND unthrottled, so every
 * detail view of a Command asset paid a Command round-trip.
 */
export async function ensureFreshAsset(
  tenantId: string,
  userId: string | undefined,
  commandAssetId: string,
): Promise<void> {
  const key = `${tenantId}:asset:${commandAssetId}`;
  const last = lastSyncAt.get(key);
  if (last !== undefined && Date.now() - last < SYNC_TTL_MS) return;
  lastSyncAt.set(key, Date.now());

  void (async () => {
    try {
      const authTenantId = await getEnabledConnectionAuthTenantId(tenantId);
      if (!authTenantId) return;
      await syncOneAssetFromCommand(tenantId, userId ?? '', authTenantId, commandAssetId);
    } catch (e) {
      console.error('[command-auto-sync] single-asset refresh failed', e);
    }
  })();
}
