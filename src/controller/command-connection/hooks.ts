/**
 * Command write-back hooks — call sites sprinkle these into the operational
 * flows (pre-start processing, meter readings, defect grounding, work-order
 * completion) so a Command-linked asset keeps its Command twin current.
 *
 * Every hook is FIRE-AND-FORGET SAFE:
 *  - no-ops instantly for local (non-Command) assets and standalone tenants,
 *  - never throws (errors are queued/logged by the outbox),
 *  - adds no meaningful latency to the calling flow when not linked.
 */

import { ObjectId } from 'mongodb';
import { getAssetsCollection, getTenantsCollection } from '@/lib/mongodb';
import { pushOrQueueWriteback, type WritebackKind } from './outbox';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CommandLink {
  authTenantId: string;
  commandAssetId: string;
}

/**
 * Is this asset a Command-linked asset in a tenant with an active (not manually
 * disabled) Command connection? Uses the tenant's persisted entitlement flags —
 * no network round-trip on the hot path.
 */
async function resolveLink(
  tenantId: string | ObjectId,
  assetId: string | ObjectId | null | undefined,
): Promise<CommandLink | null> {
  try {
    if (!assetId) return null;
    const tid = tenantId instanceof ObjectId ? tenantId : ObjectId.createFromHexString(String(tenantId));
    const aid = assetId instanceof ObjectId ? assetId : ObjectId.createFromHexString(String(assetId));

    const assets = await getAssetsCollection();
    const asset: any = await assets.findOne(
      { _id: aid, tenantId: tid },
      { projection: { source: 1, commandAssetId: 1 } },
    );
    if (asset?.source !== 'command' || !asset.commandAssetId) return null;

    const tenants = await getTenantsCollection();
    const tenant: any = await tenants.findOne(
      { _id: tid },
      { projection: { authTenantId: 1, commandEntitled: 1, commandConnectionDisabled: 1 } },
    );
    if (
      !tenant?.authTenantId ||
      tenant.commandEntitled !== true ||
      tenant.commandConnectionDisabled === true
    ) {
      return null;
    }

    return {
      authTenantId: String(tenant.authTenantId),
      commandAssetId: String(asset.commandAssetId),
    };
  } catch (e) {
    console.error('[command-hooks] resolveLink failed:', e);
    return null;
  }
}

async function push(
  tenantId: string | ObjectId,
  assetId: string | ObjectId | null | undefined,
  kind: WritebackKind,
  payload: Record<string, unknown>,
  actorEmail?: string,
): Promise<void> {
  const link = await resolveLink(tenantId, assetId);
  if (!link) return;
  await pushOrQueueWriteback({
    tenantId,
    authTenantId: link.authTenantId,
    kind,
    commandAssetId: link.commandAssetId,
    payload,
    actorEmail,
  });
}

/** Meter readings (pre-start / manual / work order) → Command asset meters. */
export function writebackMetersIfLinked(
  tenantId: string | ObjectId,
  assetId: string | ObjectId | null | undefined,
  readings: { odometer?: number; hubometer?: number; engineHours?: number },
  source: string,
  actorEmail?: string,
): Promise<void> {
  return push(tenantId, assetId, 'meters', { ...readings, source }, actorEmail);
}

/** Out-of-service flips (defect grounding / WO completion) → Command availability. */
export function writebackAvailabilityIfLinked(
  tenantId: string | ObjectId,
  assetId: string | ObjectId | null | undefined,
  outOfService: boolean,
  reason?: string,
  actorEmail?: string,
): Promise<void> {
  return push(
    tenantId,
    assetId,
    'availability',
    { outOfService, ...(reason ? { reason } : {}) },
    actorEmail,
  );
}

/** Timeline rows (prestart_submitted / service_completed / fault_*) → Command activity. */
export function writebackActivityIfLinked(
  tenantId: string | ObjectId,
  assetId: string | ObjectId | null | undefined,
  activity: { type: string; summary: string; details?: Record<string, unknown> },
  actorEmail?: string,
): Promise<void> {
  return push(tenantId, assetId, 'activity', activity, actorEmail);
}
