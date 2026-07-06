/**
 * Command connection engine — the 3-state machine for the Command integration.
 *
 *   STANDALONE  – tenant not entitled (no Command subscription) → local data
 *   CONNECTED   – entitled + Command reachable                  → live reads
 *   DEGRADED    – entitled + Command unreachable                → local/retry
 *
 * Reliability rule: entitlement comes from 3PM (authoritative) and reachability
 * from Command (runtime). A failed entitlement check is "unknown" and NEVER
 * downgrades a connected tenant — only a definitive 3PM "not subscribed" does.
 *
 * Ported from 3pm-dispatch-portal/controller/connection (proven pattern).
 */

import { ObjectId } from 'mongodb';
import {
  getTenantsCollection,
  getTenantMembersCollection,
  getRolesCollection,
  getAssetsCollection,
  getVendorsCollection,
  getLocationsCollection,
  getDriversCollection,
} from '@/lib/mongodb';
import { isCommandConfigured } from '@/lib/command/client';
import { ping } from '@/lib/command/fetchers';
import { tenantSubscribesToCommand } from '@/lib/command/threepm-data';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ConnectionState = 'standalone' | 'connected' | 'degraded';

export interface ConnectionInfo {
  /** Live runtime state for this request. */
  state: ConnectionState;
  /** Authoritative: does the tenant subscribe to Command? */
  entitled: boolean;
  /** Convenience: is master data sourced from Command right now? */
  connected: boolean;
  /** The owner manually disconnected (standalone even though entitled). */
  disabled: boolean;
  authTenantId: string | null;
  lastVerifiedAt: string | null;
}

/** How long a resolved state is trusted before a re-check (ms). */
const TTL_MS = 5 * 60 * 1000;

function standalone(
  authTenantId: string | null,
  lastVerifiedAt: Date | null,
  extra: { entitled?: boolean; disabled?: boolean } = {},
): ConnectionInfo {
  return {
    state: 'standalone',
    entitled: extra.entitled ?? false,
    connected: false,
    disabled: extra.disabled ?? false,
    authTenantId,
    lastVerifiedAt: lastVerifiedAt ? lastVerifiedAt.toISOString() : null,
  };
}

async function persist(
  tenants: Awaited<ReturnType<typeof getTenantsCollection>>,
  tenantId: ObjectId,
  data: { entitled: boolean; state: ConnectionState; verifiedNow: boolean },
): Promise<void> {
  const $set: Record<string, unknown> = {
    commandEntitled: data.entitled,
    commandConnectionState: data.state,
  };
  if (data.verifiedNow) $set.commandLastVerifiedAt = new Date();
  await tenants.updateOne({ _id: tenantId }, { $set });
}

/**
 * Resolve (and persist) the connection state for a tenant. Re-checks entitlement
 * only when stale or `force`; always probes reachability when entitled.
 */
export async function resolveConnection(
  tenantId: string | ObjectId,
  opts: { force?: boolean } = {},
): Promise<ConnectionInfo> {
  const id =
    tenantId instanceof ObjectId
      ? tenantId
      : ObjectId.isValid(tenantId)
        ? ObjectId.createFromHexString(tenantId)
        : null;
  if (!id) return standalone(null, null);

  const tenants = await getTenantsCollection();
  const tenant: any = await tenants.findOne(
    { _id: id },
    {
      projection: {
        authTenantId: 1,
        commandEntitled: 1,
        commandLastVerifiedAt: 1,
        commandConnectionDisabled: 1,
      },
    },
  );
  if (!tenant) return standalone(null, null);

  const authTenantId = tenant.authTenantId ? String(tenant.authTenantId) : null;
  const lastVerifiedAt: Date | null = tenant.commandLastVerifiedAt ?? null;
  const disabled = tenant.commandConnectionDisabled === true;

  // No bridge id or Command not configured → always standalone.
  if (!authTenantId || !isCommandConfigured()) {
    await persist(tenants, id, { entitled: false, state: 'standalone', verifiedNow: false });
    return standalone(authTenantId, lastVerifiedAt);
  }

  // ── Entitlement (3PM, authoritative) — only when stale or forced ──
  let entitled: boolean = tenant.commandEntitled ?? false;
  let verifiedNow = false;
  const stale = !lastVerifiedAt || Date.now() - new Date(lastVerifiedAt).getTime() > TTL_MS;
  if (opts.force || stale) {
    const ent = await tenantSubscribesToCommand(authTenantId);
    if (ent.ok) {
      entitled = ent.entitled; // authoritative — safe to change
      verifiedNow = true;
    }
    // ent.ok === false → "unknown": keep previous `entitled` (no downgrade)
  }

  const verifiedAtOut = verifiedNow ? new Date() : lastVerifiedAt;

  // Not entitled, or the owner manually disconnected → standalone.
  if (!entitled || disabled) {
    await persist(tenants, id, { entitled, state: 'standalone', verifiedNow });
    return standalone(authTenantId, verifiedAtOut, { entitled, disabled });
  }

  // ── Reachability (Command ping) → connected vs degraded ──
  const reachable = (await ping(authTenantId)).ok;
  const state: ConnectionState = reachable ? 'connected' : 'degraded';
  await persist(tenants, id, { entitled: true, state, verifiedNow });

  return {
    state,
    entitled: true,
    connected: true,
    disabled: false,
    authTenantId,
    lastVerifiedAt: verifiedAtOut ? verifiedAtOut.toISOString() : null,
  };
}

/** Owner toggle: manually disconnect / reconnect (kept even while entitled). */
export async function setConnectionDisabled(
  tenantId: string | ObjectId,
  disabled: boolean,
): Promise<void> {
  const id =
    tenantId instanceof ObjectId ? tenantId : ObjectId.createFromHexString(String(tenantId));
  const tenants = await getTenantsCollection();
  await tenants.updateOne({ _id: id }, { $set: { commandConnectionDisabled: disabled } });
}

/**
 * Only the tenant owner or a full-access (Admin) role may manage the Command
 * connection — mirrors the buddy-ai context rule: owner always has full access.
 */
export async function userCanManageConnection(
  userId: string,
  tenantId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(tenantId)) return false;
  const uid = ObjectId.createFromHexString(userId);
  const tid = ObjectId.createFromHexString(tenantId);

  const tenants = await getTenantsCollection();
  const tenant = await tenants.findOne({ _id: tid }, { projection: { ownerId: 1 } });
  if (tenant?.ownerId && String(tenant.ownerId) === userId) return true;

  const members = await getTenantMembersCollection();
  const member = await members.findOne(
    { userId: uid, tenantId: tid, isActive: true },
    { projection: { roleId: 1 } },
  );
  if (!member?.roleId) return false;

  const roles = await getRolesCollection();
  const role = await roles.findOne(
    { _id: member.roleId as ObjectId },
    { projection: { permissions: 1 } },
  );
  return (role?.permissions as { scope?: string } | undefined)?.scope === 'all';
}

export interface DisconnectImpact {
  commandAssets: number;
  commandVendors: number;
  commandLocations: number;
  commandDrivers: number;
}

/**
 * What disconnecting means for this tenant: counts of Command-sourced records.
 * They stay usable locally (import-and-link keeps a local copy) but stop
 * refreshing and stop writing back until reconnected.
 */
export async function getDisconnectImpact(tenantId: string | ObjectId): Promise<DisconnectImpact> {
  const id =
    tenantId instanceof ObjectId ? tenantId : ObjectId.createFromHexString(String(tenantId));
  const filter = { tenantId: id, source: 'command' };
  const [assets, vendors, locations, drivers] = await Promise.all([
    (await getAssetsCollection()).countDocuments(filter),
    (await getVendorsCollection()).countDocuments(filter),
    (await getLocationsCollection()).countDocuments(filter),
    (await getDriversCollection()).countDocuments(filter),
  ]);
  return {
    commandAssets: assets,
    commandVendors: vendors,
    commandLocations: locations,
    commandDrivers: drivers,
  };
}
