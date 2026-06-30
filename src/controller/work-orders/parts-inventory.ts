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
import type { WOPart } from './types';

interface PartInput {
  partId: string;
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
    if (!it || !ObjectId.isValid(it.partId)) continue;
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
    const unitCost = agg.unitCost != null && agg.unitCost >= 0 ? agg.unitCost : vendors[0]?.unitCost ?? 0;
    const lineTotal = money(unitCost * agg.quantity);
    parts.push({
      partId: doc._id as ObjectId,
      partName: (doc.name as string) || '',
      partNumber: (doc.partNumber as string) || '',
      quantity: agg.quantity,
      unitCost,
      lineTotal,
    });
    partsCost += lineTotal;
  }
  return { parts, partsCost: money(partsCost) };
}

/**
 * Consume (>0) or return (<0) `consumed` units across a part's stock locations.
 * Draws down locations in order; insufficient stock pushes the primary negative
 * so the recorded total always reflects reality. Returns a new array.
 */
function adjustStockLocations(
  stockLocations: Array<{ locationId: ObjectId; quantity: number }>,
  consumed: number,
): Array<{ locationId: ObjectId; quantity: number }> {
  const locs = (stockLocations || []).map((s) => ({ locationId: s.locationId, quantity: s.quantity }));
  if (consumed === 0 || locs.length === 0) return locs;

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

/** Apply the net inventory change between two WO part lists. */
export async function applyInventoryDelta(
  tenantOid: ObjectId,
  before: WOPart[] | undefined,
  after: WOPart[] | undefined,
  userOid: ObjectId,
): Promise<void> {
  const sumByPart = (list: WOPart[] | undefined) => {
    const m = new Map<string, number>();
    for (const p of list || []) {
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
  const oids = deltas.map((d) => ObjectId.createFromHexString(d.id));
  const docs = await partsCol.find({ _id: { $in: oids }, tenantId: tenantOid }).toArray();
  const docById = new Map(docs.map((d) => [d._id.toString(), d]));
  const now = new Date();

  const ops = deltas
    .map(({ id, consumed }) => {
      const doc = docById.get(id);
      if (!doc) return null;
      const newLocs = adjustStockLocations(
        (doc.stockLocations as Array<{ locationId: ObjectId; quantity: number }>) || [],
        consumed,
      );
      return {
        updateOne: {
          filter: { _id: doc._id, tenantId: tenantOid },
          update: { $set: { stockLocations: newLocs, updatedBy: userOid, updatedAt: now } },
        },
      };
    })
    .filter((op): op is NonNullable<typeof op> => op !== null);

  if (ops.length > 0) await partsCol.bulkWrite(ops);
}
