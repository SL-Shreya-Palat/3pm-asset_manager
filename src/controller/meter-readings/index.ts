/**
 * Meter readings — odometer / engine-hours history per asset.
 *
 * Adding a reading records the row and, when it's the highest value seen for that
 * meter, advances the asset's `currentOdometer` / `currentEngineHours` (odometers
 * don't run backwards) — which in turn drives service due-status. Same
 * current-meter rule as `service-history/logServiceEntry`, kept consistent here.
 */
import { ObjectId } from 'mongodb';
import { getMeterReadingsCollection, getAssetsCollection } from '@/lib/mongodb';
import { METER_TYPES, type AddMeterReadingInput, type MeterType } from './types';

function serialize(doc: Record<string, unknown>) {
  return {
    id: (doc._id as ObjectId).toString(),
    assetId: doc.assetId ? (doc.assetId as ObjectId).toString() : null,
    meterType: (doc.meterType as string) ?? null,
    value: (doc.value as number) ?? 0,
    readingAt: doc.readingAt ? new Date(doc.readingAt as Date).toISOString() : null,
    source: (doc.source as string) ?? 'manual',
    notes: (doc.notes as string) ?? null,
  };
}

/** Recent meter readings for an asset (newest first), optionally one meter type. */
export async function listMeterReadings(
  tenantId: string,
  assetId: string,
  options: { meterType?: string; limit?: number } = {},
) {
  if (!ObjectId.isValid(assetId)) return { items: [] };
  const col = await getMeterReadingsCollection();
  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
    assetId: ObjectId.createFromHexString(assetId),
  };
  if (options.meterType && (METER_TYPES as string[]).includes(options.meterType)) {
    filter.meterType = options.meterType;
  }
  const limit = Math.min(200, Math.max(1, options.limit || 50));
  const items = await col.find(filter).sort({ readingAt: -1 }).limit(limit).toArray();
  return { items: items.map((d) => serialize(d as Record<string, unknown>)) };
}

/** Record a manual meter reading + bump the asset's current meter when higher. */
export async function addMeterReading(
  tenantId: string,
  userId: string,
  assetId: string,
  input: AddMeterReadingInput,
): Promise<{ data: Record<string, unknown> | null; error: unknown }> {
  if (!ObjectId.isValid(assetId)) return { data: null, error: 'Valid asset is required' };

  const meterType = (METER_TYPES as string[]).includes(input.meterType)
    ? (input.meterType as MeterType)
    : null;
  if (!meterType) return { data: null, error: { meterType: 'Meter type must be odometer or engine_hours' } };

  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0) {
    return { data: null, error: { value: 'Value must be a non-negative number' } };
  }

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const assetOid = ObjectId.createFromHexString(assetId);
  const userOid = ObjectId.createFromHexString(userId);

  const assetsCol = await getAssetsCollection();
  const asset = await assetsCol.findOne({ _id: assetOid, tenantId: tenantOid });
  if (!asset) return { data: null, error: 'Asset not found' };

  const now = new Date();
  const readingAt = input.readingAt ? new Date(input.readingAt) : now;

  const doc = {
    tenantId: tenantOid,
    assetId: assetOid,
    meterType,
    value,
    readingAt,
    source: 'manual' as const,
    notes: input.notes?.trim() || null,
    createdBy: userOid,
    createdAt: now,
  };
  const col = await getMeterReadingsCollection();
  const result = await col.insertOne(doc);

  // Advance the asset's current meter when this reading exceeds it.
  const field = meterType === 'engine_hours' ? 'currentEngineHours' : 'currentOdometer';
  const current = (asset[field] as number) || 0;
  if (value > current) {
    await assetsCol.updateOne(
      { _id: assetOid, tenantId: tenantOid },
      { $set: { [field]: value, updatedAt: now } },
    );
  }

  return { data: serialize({ ...doc, _id: result.insertedId }), error: null };
}
