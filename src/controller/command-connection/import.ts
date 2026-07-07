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
  getUsersCollection,
  getTenantMembersCollection,
  getRolesCollection,
  getTenantsCollection,
} from '@/lib/mongodb';
import { getPage, getCommandStaff } from '@/lib/command/fetchers';
import type { CommandEntity } from '@/lib/command/types';
import { createInvitation } from '@/controller/invitations';
import { sendInvitationEmail } from '@/lib/email';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ImportEntity = 'assets' | 'drivers' | 'vendors' | 'locations' | 'stock';

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
          // Normalize Command's status strings into AM's model (in_service /
          // out_of_service). Archived assets seed as in_service — the archive
          // flag (identity tier, above) is what hides them.
          status: /maint/i.test(cmdStatus) ? 'out_of_service' : 'in_service',
          photoUrls: photo ? [photo] : [],
          teamIds: [],
          formIds: [],
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

/**
 * Staff → drivers: idempotent import, linked by commandStaffId/email.
 * Also creates user + tenantMember with Driver role and sends invitation
 * emails so imported drivers can log in to the mobile app.
 */
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

    const firstName = s.firstName || s.name || 'Unknown';
    const lastName = s.lastName || '';

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
          firstName,
          lastName,
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

    // Create tenantMember + invitation for this driver (if not already linked).
    const driverDoc = await drivers.findOne({ tenantId, $or: match });
    if (driverDoc && !driverDoc.tenantMemberId) {
      try {
        const { tenantMemberId, roleId } = await linkDriverToTenantMember(
          tenantId, userId, now, { firstName, lastName, email: s.email || undefined },
        );
        await drivers.updateOne({ _id: driverDoc._id }, { $set: { tenantMemberId } });

        // Send invitation email if driver has email
        if (s.email) {
          try {
            const { rawToken } = await createInvitation(tenantId.toString(), {
              email: s.email,
              firstName,
              lastName,
              roleId: roleId.toString(),
              invitedByUserId: userId.toString(),
            });

            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const acceptUrl = `${appUrl}/invite/accept?token=${rawToken}`;

            const usersCol = await getUsersCollection();
            const inviter = await usersCol.findOne({ _id: userId });
            const inviterName = inviter
              ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim()
              : 'A team member';

            const tenantsCol = await getTenantsCollection();
            const tenant = await tenantsCol.findOne({ _id: tenantId });
            const tenantName = (tenant?.name as string) || 'your organization';

            await sendInvitationEmail({
              recipientEmail: s.email,
              recipientName: firstName,
              inviterName,
              tenantName,
              roleName: 'Driver',
              acceptUrl,
            });
          } catch (emailErr) {
            console.error(`[importDrivers] Failed to send invitation for ${s.email}:`, emailErr);
          }
        }
      } catch (memberErr) {
        // Non-fatal: driver record is still created/updated
        console.error(`[importDrivers] Failed to create tenantMember for ${s.name}:`, memberErr);
      }
    }
  }
  return counts;
}

/**
 * Create user + tenantMember with Driver role for an imported driver.
 * Mirrors createTenantMemberForDriver in src/controller/drivers/index.ts.
 */
async function linkDriverToTenantMember(
  tenantId: ObjectId,
  createdBy: ObjectId,
  now: Date,
  driver: { firstName: string; lastName: string; email?: string },
): Promise<{ tenantMemberId: ObjectId; roleId: ObjectId }> {
  const usersCol = await getUsersCollection();
  const tenantMembersCol = await getTenantMembersCollection();
  const rolesCol = await getRolesCollection();

  // Resolve (or auto-create) Driver role
  let driverRoleId: ObjectId;
  const existingRole = await rolesCol.findOne({
    tenantId,
    key: 'driver',
    isArchived: { $ne: true },
  });
  if (existingRole) {
    driverRoleId = existingRole._id as ObjectId;
  } else {
    const roleResult = await rolesCol.insertOne({
      tenantId,
      name: 'Driver',
      key: 'driver',
      nameLower: 'driver',
      description: 'Mobile-only access for completing inspections.',
      permissions: {
        v: 2,
        forms: [
          { id: 'inspections.inspectionHistory.inspection', v: 'ALL', c: false, e: false },
        ],
        m: ['inspections'],
        sm: ['inspections.inspectionHistory'],
      },
      teamScoped: true,
      mobileOnly: true,
      isSystem: false,
      isActive: true,
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      createdBy,
      updatedBy: createdBy,
      createdAt: now,
      updatedAt: now,
    });
    driverRoleId = roleResult.insertedId;
  }

  // Upsert user
  let localUserId: ObjectId;
  if (driver.email) {
    const userResult = await usersCol.findOneAndUpdate(
      { email: driver.email },
      {
        $set: { firstName: driver.firstName, lastName: driver.lastName, updatedAt: now },
        $setOnInsert: {
          email: driver.email,
          phoneNumber: null,
          profileImageUrl: null,
          isActive: true,
          emailVerified: false,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    localUserId = userResult!._id as ObjectId;
  } else {
    const userResult = await usersCol.insertOne({
      firstName: driver.firstName,
      lastName: driver.lastName,
      email: null,
      phoneNumber: null,
      profileImageUrl: null,
      isActive: true,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });
    localUserId = userResult.insertedId;
  }

  // Upsert tenantMember
  const tmResult = await tenantMembersCol.findOneAndUpdate(
    { userId: localUserId, tenantId },
    {
      $set: {
        firstName: driver.firstName,
        lastName: driver.lastName,
        roleId: driverRoleId,
        email: driver.email || null,
        isActive: true,
        portalUser: false,
        status: 'pending',
        updatedAt: now,
      },
      $setOnInsert: {
        userId: localUserId,
        tenantId,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  return { tenantMemberId: tmResult!._id as ObjectId, roleId: driverRoleId };
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
