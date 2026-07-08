/**
 * Meter-settings controller (per-tenant singleton in `meterSettings`).
 *
 * One policy today: does a meter reading entered on work-order completion /
 * "Log Service" advance the asset's current meter, or is it kept only as a
 * reference on the service-history record? Defaults to advancing (the historic
 * behaviour) so nothing changes unless a tenant opts out.
 *
 * `shouldServiceUpdateCurrentMeter` is the cheap read used by
 * `service-history/logServiceEntry`.
 */
import { ObjectId } from 'mongodb';
import { getMeterSettingsCollection } from '@/lib/mongodb';
import type { MeterSettingsDocument, MeterSettingsInput, MeterSettingsResponse } from './types';

const DEFAULT_SERVICE_UPDATES_CURRENT = true;

function toOid(tenantId: ObjectId | string): ObjectId {
  return typeof tenantId === 'string' ? ObjectId.createFromHexString(tenantId) : tenantId;
}

function serialize(doc: MeterSettingsDocument | null): MeterSettingsResponse {
  return {
    serviceUpdatesCurrentMeter: doc?.serviceUpdatesCurrentMeter ?? DEFAULT_SERVICE_UPDATES_CURRENT,
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

/** Get the tenant's meter settings (defaults when never configured). */
export async function getMeterSettings(tenantId: string): Promise<MeterSettingsResponse> {
  const col = await getMeterSettingsCollection();
  const doc = (await col.findOne({ tenantId: toOid(tenantId) })) as MeterSettingsDocument | null;
  return serialize(doc);
}

/** Create or update the tenant's meter settings. */
export async function saveMeterSettings(
  tenantId: string,
  userId: string,
  input: MeterSettingsInput,
): Promise<MeterSettingsResponse> {
  const col = await getMeterSettingsCollection();
  const tenantOid = toOid(tenantId);
  const userOid = ObjectId.createFromHexString(userId);
  const now = new Date();

  await col.updateOne(
    { tenantId: tenantOid },
    {
      $set: {
        serviceUpdatesCurrentMeter: !!input.serviceUpdatesCurrentMeter,
        updatedBy: userOid,
        updatedAt: now,
      },
      $setOnInsert: { tenantId: tenantOid, createdAt: now },
    },
    { upsert: true },
  );

  const doc = (await col.findOne({ tenantId: tenantOid })) as MeterSettingsDocument | null;
  return serialize(doc);
}

/**
 * Should a work-order / service meter reading advance the asset's current meter?
 * Defaults to `true` when the tenant has no meter settings.
 */
export async function shouldServiceUpdateCurrentMeter(tenantId: ObjectId | string): Promise<boolean> {
  const col = await getMeterSettingsCollection();
  const doc = await col.findOne(
    { tenantId: toOid(tenantId) },
    { projection: { serviceUpdatesCurrentMeter: 1 } },
  );
  if (!doc) return DEFAULT_SERVICE_UPDATES_CURRENT;
  return (doc.serviceUpdatesCurrentMeter as boolean) ?? DEFAULT_SERVICE_UPDATES_CURRENT;
}
