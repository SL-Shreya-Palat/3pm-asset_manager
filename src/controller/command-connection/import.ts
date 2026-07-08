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
 * class) AND current meter readings (odometer, hubometer, engine hours) — these
 * are overwritten on every sync and read-only in the UI, so servicing math here
 * matches Command exactly. Asset Manager owns the OPERATIONAL wiring (programs,
 * teams, forms) — seeded on first import and never touched by a re-sync.
 */

import { ObjectId } from 'mongodb';
import {
  getAssetsCollection,
  getAssetTypesCollection,
  getDriversCollection,
  getVendorsCollection,
  getLocationsCollection,
  getPartsCollection,
  getMeasurementUnitsCollection,
  getPartLocationsCollection,
} from '@/lib/mongodb';
import { getPage, getRecord, getCommandStaff } from '@/lib/command/fetchers';
import type { CommandEntity } from '@/lib/command/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ImportEntity =
  | 'assets'
  | 'drivers'
  | 'vendors'
  | 'locations'
  | 'stock'
  | 'units'
  | 'partLocations';

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

/** Compose a Command company-location address object into one display string. */
function joinAddress(addr: Record<string, unknown> | undefined | null): string {
  const a = addr ?? {};
  return [a.addressLine1, a.addressLine2, a.city, a.state]
    .map((p: unknown) => str(p))
    .filter(Boolean)
    .join(', ');
}

/** Page through a Command list endpoint, collecting raw rows. */
async function fetchAll(
  entity: CommandEntity,
  authTenantId: string,
  query?: Record<string, string>,
): Promise<Array<Record<string, any>>> {
  const rows: Array<Record<string, any>> = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await getPage(entity, authTenantId, { page, limit: PAGE_LIMIT, query });
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

/**
 * Upsert ONE Command asset row into its local anchor doc. Shared by the full
 * import sweep AND the single-record auto-sync (asset detail refresh), so the
 * mapping + ownership tiers stay identical in both paths.
 */
async function upsertAssetRow(
  assets: Awaited<ReturnType<typeof getAssetsCollection>>,
  tenantId: ObjectId,
  userId: ObjectId,
  typeCache: Map<string, ObjectId>,
  row: Record<string, any>,
): Promise<'created' | 'updated' | 'skipped'> {
    const commandAssetId = str(row._id ?? row.id);
    if (!commandAssetId) {
      return 'skipped';
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

    // Command represents "archived" two ways: the isArchived flag AND the
    // legacy status string 'archive'/'archived' — honor both.
    const cmdStatus = (str(row.status) ?? '').toLowerCase();
    const archivedByStatus = cmdStatus === 'archive' || cmdStatus === 'archived';

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
      // Current meter readings — Command is the meter source of truth. Mirrored on
      // EVERY sync (not seed-once) so Asset Manager's servicing math uses the same
      // current odometer/hours as Command and stays 100% consistent. Command stores
      // these under assetInformation; fall back to top-level / registry defensively.
      currentOdometer: num(info.odometer) ?? num(row.odometer) ?? num(registry.odometer),
      hubometer: num(info.hubometer) ?? num(row.hubometer) ?? num(registry.hubometer),
      currentEngineHours: num(info.engineHours) ?? num(row.engineHours) ?? num(registry.engineHours),
      isArchived: row.isArchived === true || archivedByStatus,
      commandSyncedAt: new Date(),
      updatedBy: userId,
      updatedAt: new Date(),
    };
    if (assetTypeId) identity.assetTypeId = assetTypeId;
    // Drop undefined so $set never writes nulls over good data.
    for (const k of Object.keys(identity)) identity[k] === undefined && delete identity[k];

    // The asset photo is Command-owned identity data (Command's
    // assetRegistry.image — a public Azure blob URL). Refresh it on EVERY sync,
    // NOT seed-once, so an image added or changed in Command shows here on the
    // next auto-sync. Only overwrite when Command actually has an image, so a
    // momentarily-empty Command image never wipes an existing photo.
    const photo = str(row.image) ?? str(registry.image);
    if (photo) identity.photoUrls = [photo];

    const now = new Date();
    // Operational fields — seeded once, owned by Asset Manager after import.
    const setOnInsert: Record<string, unknown> = {
      tenantId,
      commandAssetId,
      source: 'command',
      // Normalize Command's status strings into AM's model (in_service /
      // out_of_service). Archived assets seed as in_service — the archive
      // flag (identity tier, above) is what hides them.
      status: /maint/i.test(cmdStatus) ? 'out_of_service' : 'in_service',
      teamIds: [],
      formIds: [],
      assetGroupIds: [],
      driverAccessIds: [],
      customFields: {},
      createdBy: userId,
      createdAt: now,
      isActive: true,
    };
    // Seed an empty gallery only when Command has no image — setting `photoUrls`
    // in both $set (above) and $setOnInsert would be a Mongo path conflict.
    if (!photo) setOnInsert.photoUrls = [];

    const result = await assets.updateOne(
      { tenantId, commandAssetId },
      { $set: identity, $setOnInsert: setOnInsert },
      { upsert: true },
    );
    return result.upsertedCount > 0 ? 'created' : 'updated';
}

/** Assets: Command is the master; identity fields overwrite, operational seed-once. */
async function importAssets(
  tenantId: ObjectId,
  userId: ObjectId,
  authTenantId: string,
): Promise<ImportCounts> {
  // Command's list hides archived assets by default and `showArchived=true`
  // returns ONLY archived — sweep both so archive state syncs losslessly.
  const rows = [
    ...(await fetchAll('assets', authTenantId)),
    ...(await fetchAll('assets', authTenantId, { showArchived: 'true' })),
  ];
  const assets = await getAssetsCollection();
  const typeCache = new Map<string, ObjectId>();
  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0 };

  for (const row of rows) {
    counts[await upsertAssetRow(assets, tenantId, userId, typeCache, row)]++;
  }
  return counts;
}

/**
 * Refresh a SINGLE Command-sourced asset into its local anchor (asset detail
 * view). Cheap — one Command GET + one upsert. Best-effort: no-ops if the record
 * can't be fetched. `getRecord` returns the raw Command row so `upsertAssetRow`
 * maps it exactly as the full sweep does.
 */
export async function syncOneAssetFromCommand(
  tenantId: string,
  userId: string,
  authTenantId: string,
  commandAssetId: string,
): Promise<void> {
  const res = await getRecord('assets', commandAssetId, authTenantId);
  if (!res.ok) return;
  const tid = ObjectId.createFromHexString(tenantId);
  const uid = ObjectId.isValid(userId) ? ObjectId.createFromHexString(userId) : new ObjectId();
  const assets = await getAssetsCollection();
  await upsertAssetRow(assets, tid, uid, new Map<string, ObjectId>(), res.data);
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
    // Only supplier-role contacts are vendor material — clients/subcontractors
    // are OUT OF SCOPE, not "skipped" (don't pollute the user-facing counts).
    const roles = row.roles ?? {};
    const isSupplier =
      roles.isSupplier === true ||
      row.isSupplier === true ||
      String(row.role ?? '').toLowerCase() === 'supplier';
    if (!isSupplier) continue;

    const commandContactId = str(row._id ?? row.id);
    const name = str(row.companyName) ?? str(row.name) ?? str(row.fullName);
    // A supplier we couldn't import (no id/name) IS worth surfacing as skipped.
    if (!commandContactId || !name) {
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
    // Only workshop/servicing and stock locations matter to Asset Manager —
    // offices, site addresses etc. are out of scope (not counted as skipped).
    const usedFor: string[] = Array.isArray(row.usedFor) ? row.usedFor.map(String) : [];
    const relevant = usedFor.some((u) => /workshop|servic|stock/i.test(u));
    if (!relevant) continue;

    const commandLocationId = str(row._id ?? row.id ?? row.value);
    const name = str(row.name) ?? str(row.locationName) ?? str(row.label);
    if (!commandLocationId || !name) {
      counts.skipped++;
      continue;
    }

    const address = joinAddress(row.address);

    const now = new Date();
    const result = await locations.updateOne(
      { tenantId, commandLocationId },
      {
        $set: {
          source: 'command',
          name,
          ...(address ? { address } : {}),
          // Command's location purposes (e.g. Stock Location, Asset Servicing).
          usedFor,
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
 * Command stock → AM Inventory (parts tagged source 'command').
 *
 * Command REMAINS the stock authority: the quantity stored here is a display
 * SNAPSHOT (refreshed on every import and decremented after each successful
 * consumption push). Correctness never depends on it — work-order completion
 * pre-flights Command's live on-hand and pushes a RECEIPTED_OUT transaction
 * into Command's ledger (strict lockstep, see completeWorkOrder).
 */
async function importStock(
  tenantId: ObjectId,
  userId: ObjectId,
  authTenantId: string,
): Promise<ImportCounts> {
  const rows = await fetchAll('stock', authTenantId);
  const parts = await getPartsCollection();
  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0 };

  for (const row of rows) {
    const commandStockId = str(row._id ?? row.id);
    const name = str(row.name) ?? str(row.description);
    if (!commandStockId || !name) {
      counts.skipped++;
      continue;
    }

    const now = new Date();
    const result = await parts.updateOne(
      { tenantId, commandStockId },
      {
        // Command-owned identity + quantity snapshot — refreshed every sync.
        $set: {
          source: 'command',
          name,
          partNumber: str(row.code) ?? str(row.itemCode) ?? '',
          description: str(row.description),
          commandUnitCost: num(row.financialInfo?.costPrice) ?? 0,
          stockLocations: [{ locationId: null, quantity: num(row.quantity) ?? 0 }],
          commandSyncedAt: now,
          updatedBy: userId,
          updatedAt: now,
        },
        $setOnInsert: {
          tenantId,
          commandStockId,
          vendors: [],
          createdBy: userId,
          createdAt: now,
          isActive: true,
          isArchived: false,
          archivedAt: null,
          archivedBy: null,
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
 * Command units → measurement units. Command is master when connected; the unit
 * name is the identity (refreshed each sync), operational flags seed-once.
 */
async function importUnits(
  tenantId: ObjectId,
  userId: ObjectId,
  authTenantId: string,
): Promise<ImportCounts> {
  const rows = await fetchAll('units', authTenantId);
  const units = await getMeasurementUnitsCollection();
  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0 };

  for (const row of rows) {
    const commandUnitId = str(row._id ?? row.id ?? row.value);
    const name = str(row.unit) ?? str(row.name) ?? str(row.label);
    if (!commandUnitId || !name) {
      counts.skipped++;
      continue;
    }
    // Command has no separate symbol/abbreviation — use one if present, else blank.
    const symbol = str(row.symbol) ?? str(row.abbreviation) ?? str(row.shortCode);

    const now = new Date();
    const result = await units.updateOne(
      { tenantId, commandUnitId },
      {
        $set: {
          source: 'command',
          name,
          ...(symbol ? { symbol } : {}),
          commandSyncedAt: now,
          updatedBy: userId,
          updatedAt: now,
        },
        $setOnInsert: {
          tenantId,
          commandUnitId,
          isDefault: false,
          createdBy: userId,
          createdAt: now,
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
 * Command company locations → part locations (the inventory stock-location
 * lookup). Command is master when connected; name is identity, refreshed each
 * sync. (Kept distinct from the `locations` collection, which stays as-is.)
 */
async function importPartLocations(
  tenantId: ObjectId,
  userId: ObjectId,
  authTenantId: string,
): Promise<ImportCounts> {
  const rows = await fetchAll('locations', authTenantId);
  const partLocations = await getPartLocationsCollection();
  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0 };

  for (const row of rows) {
    const commandLocationId = str(row._id ?? row.id ?? row.value);
    const name = str(row.name) ?? str(row.locationName) ?? str(row.label);
    if (!commandLocationId || !name) {
      counts.skipped++;
      continue;
    }

    const joinedAddress = joinAddress(row.address);
    const description = str(row.description) ?? (joinedAddress || undefined);

    const now = new Date();
    const result = await partLocations.updateOne(
      { tenantId, commandLocationId },
      {
        $set: {
          source: 'command',
          name,
          ...(description ? { description } : {}),
          commandSyncedAt: now,
          updatedBy: userId,
          updatedAt: now,
        },
        $setOnInsert: {
          tenantId,
          commandLocationId,
          isDefault: false,
          createdBy: userId,
          createdAt: now,
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
    stock: () => importStock(tid, uid, authTenantId),
    units: () => importUnits(tid, uid, authTenantId),
    partLocations: () => importPartLocations(tid, uid, authTenantId),
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
