/**
 * Work-order parts ↔ inventory bridge.
 *
 * A WO carries denormalized part lines; inventory is adjusted by the NET change
 * between the old and new lists (diff), so editing a WO never double-deducts:
 *   create:  delta [] → parts        (consume)
 *   edit:    delta oldParts → parts  (consume the increase / return the decrease)
 *   delete:  delta parts → []        (return)
 */
import { ObjectId } from 'mongodb';
import { getPartsCollection } from '@/lib/mongodb';
import { getCommandStockItem } from '@/lib/command/stock';
import type { WOPart } from './types';

interface PartInput {
  partId?: string;
  commandStockId?: string;
  commandLocationId?: string;
  quantity: number;
  unitCost?: number;
}

/** Round to 2dp, avoiding float noise. */
function money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Resolve raw part inputs into denormalized WO lines (aggregated by partId).
 * Unit cost falls back to the part's first vendor cost when not supplied.
 * Unknown / invalid parts are skipped.
 */
export async function resolveWorkOrderParts(
  tenantOid: ObjectId,
  inputs: PartInput[] | undefined,
): Promise<{ parts: WOPart[]; partsCost: number }> {
  const byId = new Map<string, { quantity: number; unitCost?: number }>();
  for (const it of inputs || []) {
    if (!it || it.commandStockId || !it.partId || !ObjectId.isValid(it.partId)) continue;
    const qty = Number(it.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const prev = byId.get(it.partId);
    if (prev) {
      prev.quantity += qty;
      if (it.unitCost != null) prev.unitCost = it.unitCost;
    } else {
      byId.set(it.partId, { quantity: qty, unitCost: it.unitCost });
    }
  }
  if (byId.size === 0) return { parts: [], partsCost: 0 };

  const partsCol = await getPartsCollection();
  const ids = [...byId.keys()].map((id) => ObjectId.createFromHexString(id));
  const docs = await partsCol.find({ _id: { $in: ids }, tenantId: tenantOid }).toArray();
  const docById = new Map(docs.map((d) => [d._id.toString(), d]));

  const parts: WOPart[] = [];
  let partsCost = 0;
  for (const [id, agg] of byId) {
    const doc = docById.get(id);
    if (!doc) continue;
    const vendors = (doc.vendors as Array<{ unitCost: number }>) || [];
    // Imported Command stock: consumption belongs to Command's ledger, not the
    // local inventory — mark the line so the delta skips it and completion
    // pushes a RECEIPTED_OUT to Command. Command owns the cost basis, so the
    // client-sent unitCost is ignored for these lines (a UI defaulting to 0
    // must never become the ledger valuation).
    const isCommandStock = doc.source === 'command' && doc.commandStockId;
    const unitCost = isCommandStock
      ? Number(doc.commandUnitCost ?? 0)
      : agg.unitCost != null && agg.unitCost >= 0
        ? agg.unitCost
        : vendors[0]?.unitCost ?? 0;
    const lineTotal = money(unitCost * agg.quantity);
    parts.push({
      partId: doc._id as ObjectId,
      partName: (doc.name as string) || '',
      partNumber: (doc.partNumber as string) || '',
      quantity: agg.quantity,
      unitCost,
      lineTotal,
      ...(isCommandStock
        ? {
            source: 'command' as const,
            commandStockId: String(doc.commandStockId),
            pushedToCommand: false,
            commandTransactionId: null,
          }
        : {}),
    });
    partsCost += lineTotal;
  }
  return { parts, partsCost: money(partsCost) };
}

/**
 * Resolve Command stock inputs into denormalized WO lines (source 'command').
 * Name/code/cost come from Command (`financialInfo.costPrice` is the cost
 * basis unless the caller supplied one). Nothing is consumed here — the OUT is
 * pushed to Command at COMPLETION (strict lockstep, see completeWorkOrder).
 * Carries over pushed-state from `existing` lines so an edit never re-pushes.
 * Throws when a Command item can't be resolved (caller surfaces the error).
 */
export async function resolveCommandStockParts(
  authTenantId: string,
  inputs: PartInput[] | undefined,
  existing?: WOPart[],
): Promise<{ parts: WOPart[]; partsCost: number }> {
  const byId = new Map<
    string,
    { quantity: number; unitCost?: number; commandLocationId?: string }
  >();
  for (const it of inputs || []) {
    if (!it?.commandStockId) continue;
    const qty = Number(it.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const prev = byId.get(it.commandStockId);
    if (prev) {
      prev.quantity += qty;
      if (it.unitCost != null) prev.unitCost = it.unitCost;
      if (it.commandLocationId) prev.commandLocationId = it.commandLocationId;
    } else {
      byId.set(it.commandStockId, {
        quantity: qty,
        unitCost: it.unitCost,
        commandLocationId: it.commandLocationId,
      });
    }
  }
  if (byId.size === 0) return { parts: [], partsCost: 0 };

  const pushedBefore = new Map(
    (existing || [])
      .filter((p) => p.source === 'command' && p.commandStockId)
      .map((p) => [p.commandStockId as string, p]),
  );

  const parts: WOPart[] = [];
  let partsCost = 0;
  for (const [stockId, agg] of byId) {
    const res = await getCommandStockItem(stockId, authTenantId);
    if (!res.ok) {
      throw new Error(
        `Could not resolve Command stock item ${stockId} (${res.reason}${res.status ? ` ${res.status}` : ''})`,
      );
    }
    // Command owns the cost basis for its stock — never the client payload.
    const unitCost = res.data.costPrice;
    const lineTotal = money(unitCost * agg.quantity);
    const prior = pushedBefore.get(stockId);
    // A line already pushed to Command must keep its pushed state and quantity —
    // changing it after the OUT was applied would desync the two ledgers.
    const alreadyPushed = prior?.pushedToCommand === true;
    parts.push({
      partId: null,
      partName: res.data.name,
      partNumber: res.data.code,
      quantity: alreadyPushed ? prior!.quantity : agg.quantity,
      unitCost: alreadyPushed ? prior!.unitCost : unitCost,
      lineTotal: alreadyPushed ? prior!.lineTotal : lineTotal,
      source: 'command',
      commandStockId: stockId,
      commandLocationId: agg.commandLocationId ?? prior?.commandLocationId,
      pushedToCommand: alreadyPushed,
      commandTransactionId: prior?.commandTransactionId ?? null,
    });
    partsCost += alreadyPushed ? prior!.lineTotal : lineTotal;
  }
  return { parts, partsCost: money(partsCost) };
}

/**
 * Consume (>0) or return (<0) `consumed` units across a part's stock locations.
 * Draws down locations in order; insufficient stock pushes the primary negative
 * so the recorded total always reflects reality. A part with no named location
 * still records against an "Unassigned" bucket (locationId: null) — so consuming
 * a location-less part is never a silent no-op. Returns a new array.
 */
function adjustStockLocations(
  stockLocations: Array<{ locationId: ObjectId | null; quantity: number }>,
  consumed: number,
): Array<{ locationId: ObjectId | null; quantity: number }> {
  const locs = (stockLocations || []).map((s) => ({ locationId: s.locationId, quantity: s.quantity }));
  if (consumed === 0) return locs;
  // No location on file → track the movement against an Unassigned bucket.
  if (locs.length === 0) locs.push({ locationId: null, quantity: 0 });

  if (consumed > 0) {
    let remaining = consumed;
    for (const loc of locs) {
      if (remaining <= 0) break;
      const take = Math.min(Math.max(loc.quantity, 0), remaining);
      loc.quantity -= take;
      remaining -= take;
    }
    if (remaining > 0) locs[0].quantity -= remaining; // not enough stock → primary goes negative
  } else {
    locs[0].quantity += -consumed; // return to the primary location
  }
  return locs;
}

/**
 * Apply the net inventory change between two WO part lists.
 *
 * Consumption spreads across a part's location buckets, so it can't be a
 * single `$inc` — instead each part uses optimistic concurrency: read, compute
 * the new buckets, write conditioned on `updatedAt` being unchanged, retry on
 * conflict. A concurrent PO receipt or second WO save re-reads instead of
 * being silently overwritten (the old blind `$set` lost whichever write came
 * first).
 */
export async function applyInventoryDelta(
  tenantOid: ObjectId,
  before: WOPart[] | undefined,
  after: WOPart[] | undefined,
  userOid: ObjectId,
): Promise<void> {
  const sumByPart = (list: WOPart[] | undefined) => {
    const m = new Map<string, number>();
    for (const p of list || []) {
      // Command stock lines live in Command's ledger — never touch AM inventory.
      if (!p.partId || p.source === 'command') continue;
      const key = p.partId.toString();
      m.set(key, (m.get(key) || 0) + p.quantity);
    }
    return m;
  };

  const beforeQty = sumByPart(before);
  const afterQty = sumByPart(after);

  const deltas: Array<{ id: string; consumed: number }> = [];
  for (const id of new Set([...beforeQty.keys(), ...afterQty.keys()])) {
    const consumed = (afterQty.get(id) || 0) - (beforeQty.get(id) || 0);
    if (consumed !== 0) deltas.push({ id, consumed });
  }
  if (deltas.length === 0) return;

  const partsCol = await getPartsCollection();
  const MAX_ATTEMPTS = 5;

  for (const { id, consumed } of deltas) {
    const partOid = ObjectId.createFromHexString(id);
    let applied = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !applied; attempt++) {
      const doc = await partsCol.findOne({ _id: partOid, tenantId: tenantOid });
      if (!doc) break; // part deleted — nothing to adjust

      const newLocs = adjustStockLocations(
        (doc.stockLocations as Array<{ locationId: ObjectId | null; quantity: number }>) || [],
        consumed,
      );
      const res = await partsCol.updateOne(
        // updatedAt is the optimistic version stamp — every stock writer bumps it.
        { _id: partOid, tenantId: tenantOid, updatedAt: doc.updatedAt },
        { $set: { stockLocations: newLocs, updatedBy: userOid, updatedAt: new Date() } },
      );
      applied = res.modifiedCount > 0;
    }

    if (!applied) {
      // Contention never settled — apply on the freshest read rather than drop
      // the movement entirely (matches the pre-fix behaviour as a last resort).
      const doc = await partsCol.findOne({ _id: partOid, tenantId: tenantOid });
      if (!doc) continue;
      const newLocs = adjustStockLocations(
        (doc.stockLocations as Array<{ locationId: ObjectId | null; quantity: number }>) || [],
        consumed,
      );
      await partsCol.updateOne(
        { _id: partOid, tenantId: tenantOid },
        { $set: { stockLocations: newLocs, updatedBy: userOid, updatedAt: new Date() } },
      );
      console.warn(`[parts-inventory] optimistic retry exhausted for part ${id} — applied unconditionally`);
    }
  }
}
