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
 * Refresh one master entity from Command, then return. Awaited at LIST read
 * entrypoints so the freshest Command data is displayed on every request.
 * No-ops when standalone; fails fast via the circuit breaker when Command is
 * unreachable (the caller then serves the local snapshot).
 */
export async function ensureFreshFromCommand(
  tenantId: string,
  userId: string | undefined,
  entity: ImportEntity,
): Promise<void> {
  try {
    const authTenantId = await getEnabledConnectionAuthTenantId(tenantId);
    if (!authTenantId) return; // standalone / not configured / disabled
    const { summary, errors } = await importFromCommand(
      tenantId,
      userId ?? '',
      authTenantId,
      [entity],
    );
    // importFromCommand catches per-entity failures INTERNALLY and returns them
    // here — surface them, otherwise a failed suppliers/stock sync silently
    // leaves the list empty with no trace (the exact "records not importing"
    // symptom is invisible without this log).
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
}

/**
 * Refresh a SINGLE Command-sourced asset from Command (asset detail view).
 * Awaited by the caller so the detail page is always current. No-ops when
 * standalone / unreachable.
 */
export async function ensureFreshAsset(
  tenantId: string,
  userId: string | undefined,
  commandAssetId: string,
): Promise<void> {
  try {
    const authTenantId = await getEnabledConnectionAuthTenantId(tenantId);
    if (!authTenantId) return;
    await syncOneAssetFromCommand(tenantId, userId ?? '', authTenantId, commandAssetId);
  } catch (e) {
    console.error('[command-auto-sync] single-asset refresh failed', e);
  }
}
