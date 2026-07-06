/**
 * Command stock operations (server-side only).
 *
 * When a work order consumes Command stock, Command remains the stock
 * authority: read per-location on-hand for pre-flight, and write the
 * consumption back via Command's non-idempotent OUT endpoint (creates a
 * RECEIPTED_OUT stockTransaction in Command — same contract the dispatch
 * portal uses). All ops return a typed CommandResult so callers can tell a
 * rejection (insufficient stock) from Command being unreachable, and block
 * completion accordingly (strict lockstep).
 *
 * Ported from 3pm-dispatch-portal/lib/command/stock.ts.
 */

import { commandRequest, commandWrite } from './client';
import type { CommandResult } from './types';

/** On-hand for one (stock item, location) as Command sees it. */
export interface CommandStockLevel {
  locationId: string;
  locationName: string;
  onHand: number;
}

/* Command's `/locations` payload shape. */
interface CommandBalanceRow {
  locationId: string;
  quantity: number;
  location?: { name?: string; code?: string };
}

/**
 * Per-location on-hand for a Command stock item. Returns a typed failure when
 * Command is unreachable/rejects so the caller can block rather than silently
 * showing zero.
 */
export async function getCommandStockLevels(
  stockId: string,
  authTenantId: string,
): Promise<CommandResult<CommandStockLevel[]>> {
  const res = await commandRequest<{ data?: CommandBalanceRow[] }>(
    `/api/stock/${encodeURIComponent(stockId)}/locations`,
    authTenantId,
  );
  if (!res.ok) return res;
  const rows = Array.isArray(res.data?.data) ? res.data!.data! : [];
  const levels = rows.map((r) => ({
    locationId: String(r.locationId),
    locationName: r.location?.name ?? r.location?.code ?? 'Unknown location',
    onHand: Number(r.quantity ?? 0),
  }));
  return { ok: true, data: levels };
}

export interface CommandStockItem {
  name: string;
  code: string;
  costPrice: number;
}

/**
 * One Command stock item's display fields + cost basis
 * (`financialInfo.costPrice` — Command owns cost). Used to denormalize WO part
 * lines and to value the OUT transaction.
 */
export async function getCommandStockItem(
  stockId: string,
  authTenantId: string,
): Promise<CommandResult<CommandStockItem>> {
  const res = await commandRequest<{
    data?: { name?: string; code?: string; financialInfo?: { costPrice?: number } };
  }>(`/api/stock/${encodeURIComponent(stockId)}`, authTenantId);
  if (!res.ok) return res;
  const d = res.data?.data ?? {};
  return {
    ok: true,
    data: {
      name: String(d.name ?? '').trim(),
      code: String(d.code ?? '').trim(),
      costPrice: Number(d.financialInfo?.costPrice ?? 0),
    },
  };
}

/**
 * Decrease Command stock (RECEIPTED_OUT + stockTransaction). Rejects with
 * `bad_request` when Command reports insufficient stock. NOT retried — the
 * endpoint is non-idempotent; callers mark the WO line pushed immediately.
 */
export async function pushStockOut(
  stockId: string,
  authTenantId: string,
  input: { quantity: number; stockLocationId?: string; unitCost?: number; notes?: string },
  actorEmail?: string,
): Promise<CommandResult<{ transactionId: string | null }>> {
  const res = await commandWrite<{ data?: { transaction?: { _id?: string } } }>(
    `/api/stock/${encodeURIComponent(stockId)}/out`,
    authTenantId,
    'POST',
    input,
    { actorEmail },
  );
  if (!res.ok) return res;
  return { ok: true, data: { transactionId: res.data?.data?.transaction?._id ?? null } };
}
