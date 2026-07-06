/**
 * Import-and-link: materialize Command master data as local documents.
 *
 * Unlike the dispatch portal's read-through lists, Asset Manager hangs
 * operational data (defects, work orders, meters, service programs) off a local
 * ObjectId — so Command records are IMPORTED as local docs tagged
 * `source: 'command'` + `command<Entity>Id`, and refreshed idempotently on
 * re-import (same discipline as the Zoho migration engine).
 *
 * Ownership rule: Command owns IDENTITY fields (name, rego, VIN, make/model,
 * class) — they're overwritten on every sync and read-only in the UI. Asset
 * Manager owns OPERATIONAL fields (meters, programs, teams, forms) — they're
 * seeded on first import and never touched by a re-sync.
 */

import { ObjectId } from 'mongodb';
import {
  getAssetsCollection,
  getAssetTypesCollection,
  getDriversCollection,
  getVendorsCollection,
  getLocationsCollection,
} from '@/lib/mongodb';
import { getPage, getCommandStaff } from '@/lib/command/fetchers';
import type { CommandEntity } from '@/lib/command/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ImportEntity = 'assets' | 'drivers' | 'vendors' | 'locations';

export interface ImportCounts {
  created: number;
  updated: number;
  skipped: number;
}

export type ImportSummary = Partial<Record<ImportEntity, ImportCounts>>;

const PAGE_LIMIT = 100;
const MAX_PAGES = 100; // safety cap (10k records/entity per run)

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Page through a Command list endpoint, collecting raw rows. */
async function fetchAll(
  entity: CommandEntity,
  authTenantId: string,
): Promise<Array<Record<string, any>>> {
  const rows: Array<Record<string, any>> = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await getPage(entity, authTenantId, { page, limit: PAGE_LIMIT });
    if (!res.ok) {
      if (page === 1) throw new Error(`Command ${entity} fetch failed: ${res.reason}`);
      break; // partial failure mid-run — keep what we have
    }
    rows.push(...res.data.items);
    if (!res.data.hasMore) break;
  }
  return rows;
}

/** Resolve (or create) the AM asset type for a Command asset-class name. */
async function resolveAssetTypeId(
  tenantId: ObjectId,
  userId: ObjectId,
  cache: Map<string, ObjectId>,
  className: string | undefined,
): Promise<ObjectId | undefined> {
  if (!className) return undefined;
  const nameLower = className.toLowerCase();
  const cached = cache.get(nameLower);
  if (cached) return cached;

  const assetTypes = await getAssetTypesCollection();
  const now = new Date();
  const existing = await assetTypes.findOneAndUpdate(
    { tenantId, nameLower },
    {
      $setOnInsert: {
        tenantId,
        name: className,
        nameLower,
        description: 'Imported from Command asset class',
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
        isActive: true,
        isArchived: false,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const id = (existing as any)?._id ?? (existing as any)?.value?._id;
  if (id) cache.set(nameLower, id);
  return id ?? undefined;
}

/** Assets: Command is the master; identity fields overwrite, operational seed-once. */
async function importAssets(
  tenantId: ObjectId,
  userId: ObjectId,
  authTenantId: string,
): Promise<ImportCounts> {
  const rows = await fetchAll('assets', authTenantId);
  const assets = await getAssetsCollection();
  const typeCache = new Map<string, ObjectId>();
  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0 };

  for (const row of rows) {
    const commandAssetId = str(row._id ?? row.id);
    if (!commandAssetId) {
      counts.skipped++;
      continue;
    }

    const registry = row.assetRegistry ?? {};
    const info = row.assetInformation ?? {};
    const compliance = row.assetCompliance ?? {};

    const name =
      str(row.assetDisplay) ??
      str(registry.assetDisplay) ??
      str(row.internalDescription) ??
      str(registry.internalDescription) ??
      str(row.assetNumber) ??
      str(registry.assetNumber) ??
      str(row.assetCode) ??
      str(registry.assetCode) ??
      'Command asset';

    const assetTypeId = await resolveAssetTypeId(
      tenantId,
      userId,
      typeCache,
      str(row.assetClassName),
    );

    // Command-owned identity fields — refreshed on every sync.
    const identity: Record<string, unknown> = {
      name,
      assetNumber: str(row.assetNumber) ?? str(registry.assetNumber) ?? str(registry.assetCode),
      vin: str(row.vin) ?? str(info.vin),
      licensePlate: str(row.registrationNumber) ?? str(compliance.registrationNumber),
      make: str(row.make) ?? str(info.make),
      model: str(row.model) ?? str(info.model),
      year: num(row.yearOfManufacture) ?? num(info.yearOfManufacture),
      color: str(info.colour),
      fuelType: str(info.fuelType),
      isArchived: row.isArchived === true,
      commandSyncedAt: new Date(),
      updatedBy: userId,
      updatedAt: new Date(),
    };
    if (assetTypeId) identity.assetTypeId = assetTypeId;
    // Drop undefined so $set never writes nulls over good data.
    for (const k of Object.keys(identity)) identity[k] === undefined && delete identity[k];

    const photo = str(row.image) ?? str(registry.image);
    const now = new Date();
    const result = await assets.updateOne(
      { tenantId, commandAssetId },
      {
        $set: identity,
        // Operational fields — seeded once, owned by Asset Manager after import.
        $setOnInsert: {
          tenantId,
          commandAssetId,
          source: 'command',
          status: str(row.status) ?? 'active',
          photoUrls: photo ? [photo] : [],
          currentOdometer: num(row.odometer),
          hubometer: num(row.hubometer),
          currentEngineHours: num(row.engineHours),
          teamIds: [],
          formIds: [],
          serviceProgramIds: [],
          assetGroupIds: [],
          driverAccessIds: [],
          customFields: {},
          createdBy: userId,
          createdAt: now,
          isActive: true,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) counts.created++;
    else counts.updated++;
  }
  return counts;
}

/** Staff → drivers: one-time idempotent import, linked by commandStaffId/email. */
async function importDrivers(
  tenantId: ObjectId,
  userId: ObjectId,
  authTenantId: string,
): Promise<ImportCounts> {
  const res = await getCommandStaff(authTenantId);
  if (!res.ok) throw new Error(`Command staff fetch failed: ${res.reason}`);
  const drivers = await getDriversCollection();
  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0 };

  for (const s of res.data) {
    if (!s.firstName && !s.lastName && !s.email) {
      counts.skipped++;
      continue;
    }

    // Link an existing local driver by email (never duplicate a person).
    const match: Record<string, unknown>[] = [{ commandStaffId: s.id }];
    if (s.email) match.push({ email: s.email });

    const now = new Date();
    const result = await drivers.updateOne(
      { tenantId, $or: match },
      {
        $set: {
          commandStaffId: s.id,
          source: 'command',
          firstName: s.firstName || s.name || 'Unknown',
          lastName: s.lastName || '',
          ...(s.email ? { email: s.email } : {}),
          ...(s.phone ? { mobileNumber: s.phone } : {}),
          commandSyncedAt: now,
          updatedBy: userId,
          updatedAt: now,
        },
        $setOnInsert: {
          tenantId,
          createdBy: userId,
          createdAt: now,
          isActive: true,
          isArchived: false,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) counts.created++;
    else counts.updated++;
  }
  return counts;
}

/** Suppliers → vendors (business contacts with the supplier role). */
async function importVendors(
  tenantId: ObjectId,
  userId: ObjectId,
  authTenantId: string,
): Promise<ImportCounts> {
  const rows = await fetchAll('suppliers', authTenantId);
  const vendors = await getVendorsCollection();
  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0 };

  for (const row of rows) {
    const commandContactId = str(row._id ?? row.id);
    // Only contacts flagged as suppliers become vendors.
    const roles = row.roles ?? {};
    const isSupplier =
      roles.isSupplier === true ||
      row.isSupplier === true ||
      String(row.role ?? '').toLowerCase() === 'supplier';
    if (!commandContactId || !isSupplier) {
      counts.skipped++;
      continue;
    }

    const name = str(row.companyName) ?? str(row.name) ?? str(row.fullName);
    if (!name) {
      counts.skipped++;
      continue;
    }

    const now = new Date();
    const result = await vendors.updateOne(
      { tenantId, commandContactId },
      {
        $set: {
          source: 'command',
          name,
          contactName: str(row.contactName) ?? str(row.contactPerson) ?? name,
          ...(str(row.email) ? { email: str(row.email) } : {}),
          ...(str(row.phone) ?? str(row.mobile) ? { phone: str(row.phone) ?? str(row.mobile) } : {}),
          commandSyncedAt: now,
          updatedBy: userId,
          updatedAt: now,
        },
        $setOnInsert: {
          tenantId,
          commandContactId,
          vendorTypes: ['parts', 'services'],
          publicEditAccess: false,
          createdBy: userId,
          createdAt: now,
          isActive: true,
          isArchived: false,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) counts.created++;
    else counts.updated++;
  }
  return counts;
}

/** Company locations → locations. */
async function importLocations(
  tenantId: ObjectId,
  userId: ObjectId,
  authTenantId: string,
): Promise<ImportCounts> {
  const rows = await fetchAll('locations', authTenantId);
  const locations = await getLocationsCollection();
  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0 };

  for (const row of rows) {
    const commandLocationId = str(row._id ?? row.id ?? row.value);
    const name = str(row.name) ?? str(row.locationName) ?? str(row.label);
    if (!commandLocationId || !name) {
      counts.skipped++;
      continue;
    }

    const addr = row.address ?? {};
    const address = [addr.addressLine1, addr.addressLine2, addr.city, addr.state]
      .map((p: unknown) => str(p))
      .filter(Boolean)
      .join(', ');

    const now = new Date();
    const result = await locations.updateOne(
      { tenantId, commandLocationId },
      {
        $set: {
          source: 'command',
          name,
          ...(address ? { address } : {}),
          commandSyncedAt: now,
          updatedBy: userId,
          updatedAt: now,
        },
        $setOnInsert: {
          tenantId,
          commandLocationId,
          createdBy: userId,
          createdAt: now,
          isActive: true,
          isArchived: false,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) counts.created++;
    else counts.updated++;
  }
  return counts;
}

/**
 * Run the selected imports for a tenant. Each entity is independent — one
 * failing does not abort the others; failures surface in `errors`.
 */
export async function importFromCommand(
  tenantId: string,
  userId: string,
  authTenantId: string,
  entities: ImportEntity[],
): Promise<{ summary: ImportSummary; errors: Partial<Record<ImportEntity, string>> }> {
  const tid = ObjectId.createFromHexString(tenantId);
  const uid = ObjectId.isValid(userId)
    ? ObjectId.createFromHexString(userId)
    : new ObjectId();

  const summary: ImportSummary = {};
  const errors: Partial<Record<ImportEntity, string>> = {};

  const runners: Record<ImportEntity, () => Promise<ImportCounts>> = {
    assets: () => importAssets(tid, uid, authTenantId),
    drivers: () => importDrivers(tid, uid, authTenantId),
    vendors: () => importVendors(tid, uid, authTenantId),
    locations: () => importLocations(tid, uid, authTenantId),
  };

  for (const entity of entities) {
    const run = runners[entity];
    if (!run) continue;
    try {
      summary[entity] = await run();
    } catch (e) {
      errors[entity] = e instanceof Error ? e.message : 'Import failed';
    }
  }

  return { summary, errors };
}
