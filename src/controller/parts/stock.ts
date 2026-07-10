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
 *
 * Concurrency: credits use `$inc` on the location bucket (commutative), never
 * a read-modify-write of the whole array — a simultaneous work-order deduction
 * or second receipt can't erase this credit. Command-sourced parts are never
 * credited: their quantities live in Command's ledger and the next sync would
 * wipe a local credit (callers pre-check and surface this; the filter here is
 * the backstop).
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
  const now = new Date();
  let credited = 0;

  for (const e of valid) {
    const baseFilter = { _id: e.partId, tenantId: tenantOid, source: { $ne: 'command' } };
    const incUpdate = {
      $inc: { 'stockLocations.$.quantity': e.quantity },
      $set: { updatedBy: userOid, updatedAt: now },
    };

    // Bucket exists → atomic increment.
    const inc = await partsCol.updateOne(
      { ...baseFilter, 'stockLocations.locationId': locationId },
      incUpdate,
    );
    if (inc.matchedCount > 0) {
      credited++;
      continue;
    }

    // No bucket yet → create it (filter re-checks absence so a concurrent
    // creator can't produce a duplicate bucket).
    const push = await partsCol.updateOne(
      { ...baseFilter, 'stockLocations.locationId': { $ne: locationId } },
      {
        $push: { stockLocations: { locationId, quantity: e.quantity } },
        $set: { updatedBy: userOid, updatedAt: now },
      } as Record<string, unknown>,
    );
    if (push.matchedCount > 0) {
      credited++;
      continue;
    }

    // Lost the create race — the bucket exists now; increment it.
    const retry = await partsCol.updateOne(
      { ...baseFilter, 'stockLocations.locationId': locationId },
      incUpdate,
    );
    if (retry.matchedCount > 0) credited++;
  }

  return credited;
}
