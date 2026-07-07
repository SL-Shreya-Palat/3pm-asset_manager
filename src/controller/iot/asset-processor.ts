/**
 * Map IoT Hub devices onto the asset-manager `assets` schema and bulk-upsert.
 *
 * Matching an incoming device to an existing asset is by iotId → licensePlate
 * (rego) → assetNumber/internalFleetNumber (fleet). Archived assets are skipped
 * so a retired device isn't resurrected.
 *
 * On UPDATE we only refresh device facts + telemetry — never `name`,
 * `assetNumber`, `status`, or `teamIds`, so a user's edits/team assignment and
 * grounding aren't clobbered by a sync. New assets get sensible defaults.
 */
import { ObjectId, type Collection } from 'mongodb';
import type { IoTDevice } from './api';

function num(v: unknown): number | undefined {
  return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
}

/** Device facts + telemetry that are safe to refresh on every sync. */
function buildTelemetryFields(device: IoTDevice, userId: ObjectId, now: Date): Record<string, unknown> {
  const rego = (device.registrationNumber || '').trim();
  const fleet = (device.fleetName || '').trim();
  const lat = num(device.latitude);
  const lng = num(device.longitude);
  const hasGeo = lat != null && lng != null && (lat !== 0 || lng !== 0);

  const fields: Record<string, unknown> = {
    make: device.make || undefined,
    model: device.model || undefined,
    year: num(device.yearOfManufacture),
    color: device.colour || undefined,
    vin: device.vinNumber || undefined,
    licensePlate: rego || undefined,
    currentOdometer: num(device.odoMeter),
    currentEngineHours: num(device.hours),
    // IoT-specific telemetry
    iotId: device.iotId || undefined,
    iotProviderName: device.iotProviderName || undefined,
    internalFleetNumber: fleet || undefined,
    iotLastReadingAt: device.lastReadingAt ? new Date(device.lastReadingAt) : undefined,
    source: 'iot',
    updatedBy: userId,
    updatedAt: now,
  };
  if (hasGeo) {
    fields.iotLocation = { latitude: lat, longitude: lng };
    fields.iotCoordinates = [lng, lat]; // [longitude, latitude]
  }
  return fields;
}

/** Full document for a brand-new IoT-sourced asset. */
function buildNewAsset(device: IoTDevice, tenantId: ObjectId, userId: ObjectId, now: Date): Record<string, unknown> {
  const rego = (device.registrationNumber || '').trim();
  const fleet = (device.fleetName || '').trim();
  const iotId = device.iotId || '';
  const name =
    fleet ||
    rego ||
    [device.make, device.model].filter(Boolean).join(' ').trim() ||
    iotId ||
    'IoT Asset';

  return {
    _id: new ObjectId(),
    tenantId,
    name,
    assetNumber: fleet || rego || undefined,
    status: 'in_service',
    primaryMeter: 'odometer',
    currencyCode: 'USD',
    teamIds: [],
    formIds: [],
    assetGroupIds: [],
    driverAccessIds: [],
    photoUrls: [],
    ...buildTelemetryFields(device, userId, now),
    createdBy: userId,
    createdAt: now,
    isActive: true,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  };
}

type BulkOp =
  | { updateOne: { filter: Record<string, unknown>; update: { $set: Record<string, unknown> } } }
  | { insertOne: { document: Record<string, unknown> } };

/** A device paired with the asset it resolved to — used to attach compliance docs. */
export interface AssetLink {
  assetId: ObjectId;
  device: IoTDevice;
}

/**
 * Bulk-upsert a batch of devices into `assets`. One find (all identifiers) +
 * one bulkWrite (chunked at 1000). Returns per-device asset links so the caller
 * can sync compliance documents against each resolved asset.
 */
export async function processDevicesBatch(
  devices: IoTDevice[],
  assetsCollection: Collection,
  tenantId: ObjectId,
  userId: ObjectId,
  now: Date,
): Promise<{ created: number; updated: number; errors: string[]; links: AssetLink[] }> {
  const result = { created: 0, updated: 0, errors: [] as string[], links: [] as AssetLink[] };
  if (devices.length === 0) return result;

  // Devices must have an iotId to be trackable.
  const valid = devices.filter((d) => {
    if (!d.iotId) {
      result.errors.push(`Device missing iotId: ${d.fleetName || d.registrationNumber || 'Unknown'}`);
      return false;
    }
    return true;
  });
  if (valid.length === 0) return result;

  const iotIds = new Set<string>();
  const regos = new Set<string>();
  const fleets = new Set<string>();
  for (const d of valid) {
    if (d.iotId) iotIds.add(d.iotId);
    if (d.registrationNumber) regos.add(d.registrationNumber.trim());
    if (d.fleetName) fleets.add(d.fleetName.trim());
  }

  const or: Array<Record<string, unknown>> = [];
  if (iotIds.size) or.push({ iotId: { $in: [...iotIds] } });
  if (regos.size) or.push({ licensePlate: { $in: [...regos] } });
  if (fleets.size) {
    or.push({ assetNumber: { $in: [...fleets] } }, { internalFleetNumber: { $in: [...fleets] } });
  }

  const existing =
    or.length > 0
      ? await assetsCollection.find({ tenantId, isArchived: { $ne: true }, $or: or }).toArray()
      : [];

  // Lookup map: iotId / rego / fleet → asset.
  const byKey = new Map<string, (typeof existing)[number]>();
  for (const a of existing) {
    if (a.iotId) byKey.set(`iot:${a.iotId}`, a);
    if (a.licensePlate) byKey.set(`reg:${String(a.licensePlate).trim()}`, a);
    if (a.assetNumber) byKey.set(`fleet:${String(a.assetNumber).trim()}`, a);
    if (a.internalFleetNumber) byKey.set(`fleet:${String(a.internalFleetNumber).trim()}`, a);
  }

  const ops: BulkOp[] = [];
  for (const d of valid) {
    const iotId = d.iotId || '';
    const rego = (d.registrationNumber || '').trim();
    const fleet = (d.fleetName || '').trim();
    const match =
      byKey.get(`iot:${iotId}`) ||
      (rego && byKey.get(`reg:${rego}`)) ||
      (fleet && byKey.get(`fleet:${fleet}`));

    if (match) {
      ops.push({
        updateOne: {
          filter: { _id: match._id },
          update: { $set: buildTelemetryFields(d, userId, now) },
        },
      });
      result.links.push({ assetId: match._id as ObjectId, device: d });
    } else {
      const newDoc = buildNewAsset(d, tenantId, userId, now);
      ops.push({ insertOne: { document: newDoc } });
      result.links.push({ assetId: newDoc._id as ObjectId, device: d });
    }
  }

  const MAX_BULK = 1000;
  for (let i = 0; i < ops.length; i += MAX_BULK) {
    const chunk = ops.slice(i, i + MAX_BULK);
    try {
      const res = await assetsCollection.bulkWrite(chunk, { ordered: false });
      result.created += res.insertedCount;
      result.updated += res.modifiedCount;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown bulk write error';
      result.errors.push(`Bulk write error (chunk ${Math.floor(i / MAX_BULK) + 1}): ${msg}`);
      console.error('[IoT] Bulk write error:', error);
    }
  }

  return result;
}
