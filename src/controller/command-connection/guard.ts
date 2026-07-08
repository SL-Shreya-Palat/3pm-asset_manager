/**
 * Master-data ownership guard.
 *
 * While the Command connection is ON, master data (assets, staff→drivers,
 * suppliers→vendors, locations) is ADDED AND EDITED IN COMMAND ONLY — Asset
 * Manager manages the operational side (inspections, defects, work orders,
 * service programs, meters). Enforced at the controller chokepoints so every
 * caller (API routes, Buddy AI actions) hits the same rule:
 *
 *  - creates of master-data records are blocked while the connection is on,
 *  - Command-owned identity fields on `source: 'command'` records are stripped
 *    from local updates (operational fields still save normally),
 *  - Command-sourced records can't be archived locally while connected.
 *
 * The guard keys off the INTENDED connection (entitled + not manually
 * disabled + configured), not live reachability — a Command outage must not
 * suddenly allow local creates that will conflict after recovery.
 */

import { ObjectId } from 'mongodb';
import { getTenantsCollection } from '@/lib/mongodb';
import { isCommandConfigured } from '@/lib/command/client';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const MASTER_DATA_MANAGED_MESSAGE =
  'Master data is managed in Command while the connection is on. Add or edit this record in Command — it refreshes here automatically.';

/**
 * Is the Command connection ON for this tenant (entitled, not manually
 * disabled, env configured)? Cheap: persisted tenant flags only, no network.
 */
export async function isCommandConnectionEnabled(
  tenantId: string | ObjectId,
): Promise<boolean> {
  try {
    if (!isCommandConfigured()) return false;
    const tid =
      tenantId instanceof ObjectId
        ? tenantId
        : ObjectId.isValid(tenantId)
          ? ObjectId.createFromHexString(tenantId)
          : null;
    if (!tid) return false;

    const tenants = await getTenantsCollection();
    const tenant: any = await tenants.findOne(
      { _id: tid },
      { projection: { authTenantId: 1, commandEntitled: 1, commandConnectionDisabled: 1 } },
    );
    return Boolean(
      tenant?.authTenantId &&
        tenant.commandEntitled === true &&
        tenant.commandConnectionDisabled !== true,
    );
  } catch (e) {
    console.error('[command-guard] isCommandConnectionEnabled failed:', e);
    return false;
  }
}

/**
 * The tenant's 3PM authTenantId when the Command connection is ON, else null.
 * Convenience for flows that need to CALL Command (e.g. stock consumption) —
 * combines the enabled check with the bridge-id lookup in one read.
 */
export async function getEnabledConnectionAuthTenantId(
  tenantId: string | ObjectId,
): Promise<string | null> {
  try {
    if (!isCommandConfigured()) return null;
    const tid =
      tenantId instanceof ObjectId
        ? tenantId
        : ObjectId.isValid(tenantId)
          ? ObjectId.createFromHexString(tenantId)
          : null;
    if (!tid) return null;

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
    return String(tenant.authTenantId);
  } catch (e) {
    console.error('[command-guard] getEnabledConnectionAuthTenantId failed:', e);
    return null;
  }
}

/** Command-owned identity fields per entity — read-only in Asset Manager. */
export const COMMAND_OWNED_FIELDS = {
  assets: [
    'name',
    'assetNumber',
    'vin',
    'licensePlate',
    'make',
    'model',
    'year',
    'color',
    'fuelType',
    'assetTypeId',
    // The asset photo mirrors Command's image and is refreshed on every sync —
    // strip it from local edits so an AM upload can't be silently overwritten.
    'photoUrls',
  ],
  drivers: ['firstName', 'lastName', 'email', 'mobileNumber'],
  vendors: ['name', 'contactName', 'email', 'phone'],
  // Command stock: identity + quantities live in Command's ledger.
  parts: ['name', 'partNumber', 'description', 'stockLocations'],
} as const;

/**
 * Strip Command-owned fields from an update payload for a `source: 'command'`
 * record. Returns the (possibly reduced) input plus which keys were dropped so
 * callers can log/inform. Operational fields pass through untouched.
 */
export function stripCommandOwnedFields<T extends Record<string, unknown>>(
  input: T,
  entity: keyof typeof COMMAND_OWNED_FIELDS,
): { input: T; stripped: string[] } {
  const owned = COMMAND_OWNED_FIELDS[entity] as readonly string[];
  const stripped: string[] = [];
  const out: Record<string, unknown> = { ...input };
  for (const key of owned) {
    if (key in out && out[key] !== undefined) {
      delete out[key];
      stripped.push(key);
    }
  }
  return { input: out as T, stripped };
}
