/**
 * Inventory stock crediting — the replenish side of the loop.
 *
 * Work orders DEDUCT stock (see controller/work-orders/parts-inventory.ts).
 * This module ADDS stock, used when a purchase order is received. Kept generic so
 * a future manual "receive stock / adjust" action can reuse it.
 */
import { ObjectId } from 'mongodb';
import { getPartsCollection } from '@/lib/mongodb';

export interface StockCreditEntry {
  partId: ObjectId;
  quantity: number;
}

/**
 * Add `quantity` units of each part to the given location's stock. If the part
 * has no bucket for that location yet, one is created. Parts not found or with a
 * non-positive quantity are skipped. Returns the number of parts updated.
 */
export async function creditPartsStock(
  tenantOid: ObjectId,
  entries: StockCreditEntry[],
  locationId: ObjectId,
  userOid: ObjectId,
): Promise<number> {
  const valid = entries.filter((e) => e.partId && Number.isFinite(e.quantity) && e.quantity > 0);
  if (valid.length === 0) return 0;

  const partsCol = await getPartsCollection();
  const ids = valid.map((e) => e.partId);
  const docs = await partsCol.find({ _id: { $in: ids }, tenantId: tenantOid }).toArray();
  const docById = new Map(docs.map((d) => [d._id.toString(), d]));
  const now = new Date();

  const ops = valid
    .map((e) => {
      const doc = docById.get(e.partId.toString());
      if (!doc) return null;
      const locs = ((doc.stockLocations as Array<{ locationId: ObjectId | null; quantity: number }>) || [])
        .map((s) => ({ locationId: s.locationId, quantity: s.quantity }));
      const idx = locs.findIndex((s) => s.locationId && s.locationId.toString() === locationId.toString());
      if (idx >= 0) locs[idx].quantity += e.quantity;
      else locs.push({ locationId, quantity: e.quantity });
      return {
        updateOne: {
          filter: { _id: doc._id, tenantId: tenantOid },
          update: { $set: { stockLocations: locs, updatedBy: userOid, updatedAt: now } },
        },
      };
    })
    .filter((op): op is NonNullable<typeof op> => op !== null);

  if (ops.length === 0) return 0;
  await partsCol.bulkWrite(ops);
  return ops.length;
}
