/**
 * Centralized index creation — runs on every server boot (instrumentation).
 *
 * Every compound index is tenant-led (`tenantId` first).
 *
 * Resilience: each index is created independently — one failure (legacy
 * duplicate data, option drift) logs a warning and never blocks the rest.
 * Previously a single bad index aborted the whole run, leaving later
 * collections (users, tenantMembers…) with no indexes at all.
 *
 * Uniqueness on OPTIONAL fields uses `partialFilterExpression` on the field
 * type instead of `sparse`: sparse indexes still index documents where the
 * field is explicitly null (only MISSING fields are skipped), so two docs
 * with `field: null` — e.g. 3PM-sourced invitations without a tokenHash, or
 * assets without an assetNumber — collide: the build fails on existing data
 * and, once built, the second such insert crashes at runtime.
 */
import type { Collection, Document, IndexSpecification, CreateIndexesOptions } from 'mongodb';
import { getDb } from './mongodb';

/**
 * Create one index, never throwing.
 * When the same keys already exist with different options (a definition was
 * corrected — codes 85/86), the stale index is dropped and recreated.
 */
async function ensureIndex(
  collection: Collection<Document>,
  keys: IndexSpecification,
  options: CreateIndexesOptions = {},
): Promise<void> {
  try {
    await collection.createIndex(keys, options);
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 85 || code === 86) {
      // IndexOptionsConflict / IndexKeySpecsConflict → replace the stale definition.
      try {
        const existing = await collection.indexes();
        const keyJson = JSON.stringify(keys);
        const stale = existing.find((i) => JSON.stringify(i.key) === keyJson);
        if (stale?.name) await collection.dropIndex(stale.name);
        await collection.createIndex(keys, options);
        return;
      } catch (retryErr) {
        console.warn(
          `[indexes] ${collection.collectionName} ${JSON.stringify(keys)} recreate failed:`,
          retryErr instanceof Error ? retryErr.message : retryErr,
        );
        return;
      }
    }
    console.warn(
      `[indexes] ${collection.collectionName} ${JSON.stringify(keys)} failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function setupIndexes(): Promise<void> {
  const db = await getDb();

  // --- members (legacy collection — kept for compatibility) ---
  const members = db.collection('members');
  await ensureIndex(members, { tenantId: 1, status: 1 });
  await ensureIndex(members, { tenantId: 1, roleId: 1 });
  await ensureIndex(members, { tenantId: 1, email: 1 }, { unique: true, sparse: true });
  await ensureIndex(members, { tenantId: 1, authUserId: 1 }, { unique: true, sparse: true });
  await ensureIndex(members, { tenantId: 1, 'driver.teamIds': 1 });
  await ensureIndex(members, { tenantId: 1, 'driver.license.expiresAt': 1 });

  // --- teams ---
  const teams = db.collection('teams');
  await ensureIndex(teams, { tenantId: 1, nameLower: 1 }, { unique: true });
  await ensureIndex(teams, { tenantId: 1, managerIds: 1 });
  await ensureIndex(teams, { tenantId: 1, isArchived: 1 });

  // --- roles ---
  const roles = db.collection('roles');
  await ensureIndex(roles, { tenantId: 1, nameLower: 1 }, { unique: true });
  await ensureIndex(roles, { tenantId: 1, key: 1 });
  await ensureIndex(roles, { tenantId: 1, isSystem: 1 });

  // --- invitations ---
  const invitations = db.collection('invitations');
  await ensureIndex(invitations, { tenantId: 1, status: 1 });
  await ensureIndex(invitations, { tenantId: 1, email: 1, status: 1 });
  // Partial, NOT plain unique: 3PM-sourced invitations carry no tokenHash, so a
  // non-partial unique index breaks the second 3PM invite in a tenant (E11000).
  await ensureIndex(
    invitations,
    { tenantId: 1, tokenHash: 1 },
    { unique: true, partialFilterExpression: { tokenHash: { $type: 'string' } } },
  );
  await ensureIndex(invitations, { tenantId: 1, expiresAt: 1 });

  // --- assets ---
  const assets = db.collection('assets');
  await ensureIndex(assets, { tenantId: 1, status: 1 });
  // Partial: null assetNumber/qrCode docs exist and must not collide.
  await ensureIndex(
    assets,
    { tenantId: 1, assetNumber: 1 },
    { unique: true, partialFilterExpression: { assetNumber: { $type: 'string' } } },
  );
  await ensureIndex(assets, { tenantId: 1, teamIds: 1 });
  await ensureIndex(assets, { tenantId: 1, assetGroupIds: 1 });
  await ensureIndex(
    assets,
    { tenantId: 1, qrCode: 1 },
    { unique: true, partialFilterExpression: { qrCode: { $type: 'string' } } },
  );
  await ensureIndex(assets, { tenantId: 1, isArchived: 1 });

  // --- drivers ---
  const drivers = db.collection('drivers');
  await ensureIndex(drivers, { tenantId: 1, isArchived: 1 });
  await ensureIndex(drivers, { tenantId: 1, teamId: 1 });
  await ensureIndex(drivers, { tenantId: 1, email: 1 }, { sparse: true });
  await ensureIndex(drivers, { tenantId: 1, employeeNumber: 1 }, { sparse: true });
  await ensureIndex(drivers, { tenantId: 1, licenseNumber: 1 }, { sparse: true });
  await ensureIndex(drivers, { tenantId: 1, tenantMemberId: 1 }, { sparse: true });

  // --- assetTypes ---
  const assetTypes = db.collection('assetTypes');
  await ensureIndex(assetTypes, { tenantId: 1, nameLower: 1 }, { unique: true });
  await ensureIndex(assetTypes, { tenantId: 1, isArchived: 1 });

  // --- assetGroups ---
  const assetGroups = db.collection('assetGroups');
  await ensureIndex(assetGroups, { tenantId: 1, nameLower: 1 }, { unique: true });

  // --- locations ---
  const locations = db.collection('locations');
  await ensureIndex(locations, { tenantId: 1, name: 1 });

  // --- documents ---
  const documents = db.collection('documents');
  await ensureIndex(documents, { tenantId: 1, scope: 1, assetId: 1 });
  await ensureIndex(documents, { tenantId: 1, scope: 1, driverId: 1 });
  await ensureIndex(documents, { tenantId: 1, expiryDate: 1 });

  // --- meterReadings ---
  const meterReadings = db.collection('meterReadings');
  await ensureIndex(meterReadings, { tenantId: 1, assetId: 1, meterType: 1, readingAt: -1 });

  // --- counters ---
  // No secondary index: counters are keyed by string _id (`emp_<tenant>`,
  // `wo_<tenant>`, `po_<tenant>`, `defect_<tenant>`), which is already unique.
  // The old { tenantId, name } unique index matched no counter shape (no doc
  // has a `name`) and could never build over existing data.

  // --- users (auth lookup + provisioning upsert) ---
  const users = db.collection('users');
  await ensureIndex(users, { authUserId: 1 }, { unique: true, sparse: true });
  // Partial: drivers created without an email produce `email: null` users —
  // a sparse unique index still indexes explicit nulls and would reject the
  // second such user.
  await ensureIndex(
    users,
    { email: 1 },
    { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
  );

  // --- tenants (auth lookup) ---
  const tenants = db.collection('tenants');
  await ensureIndex(tenants, { authTenantId: 1 }, { unique: true, sparse: true });

  // --- tenantMembers (auth lookup + provisioning upsert) ---
  const tenantMembers = db.collection('tenantMembers');
  // Partial on userId: invited members have no userId until they accept, and a
  // compound sparse index still indexes them (tenantId present) — the second
  // pending invite in a tenant would collide.
  await ensureIndex(
    tenantMembers,
    { userId: 1, tenantId: 1 },
    { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } },
  );
  await ensureIndex(tenantMembers, { userId: 1, isActive: 1 });
  await ensureIndex(tenantMembers, { tenantId: 1, isActive: 1 });
  await ensureIndex(tenantMembers, { tenantId: 1, email: 1 }, { sparse: true });
  await ensureIndex(tenantMembers, { tenantId: 1, status: 1 });

  // --- faults ---
  const faults = db.collection('faults');
  await ensureIndex(faults, { tenantId: 1, status: 1 });
  await ensureIndex(faults, { tenantId: 1, assetId: 1 });
  await ensureIndex(faults, { tenantId: 1, isArchived: 1 });
  await ensureIndex(
    faults,
    { tenantId: 1, faultNumber: 1 },
    { unique: true, partialFilterExpression: { faultNumber: { $type: 'string' } } },
  );

  // -------------------------------------------------------------------------
  // List sort-covering indexes.
  //
  // Every paginated list does `find({ tenantId, isArchived: { $ne: true } })
  // .sort({ createdAt: -1 })` (or date/submittedAt/performedAt). Without an
  // index whose trailing key matches the sort, Mongo scans the tenant's whole
  // collection and sorts in memory — the dominant cost as data grows.
  //
  // The default list is `{ tenantId, isArchived: { $ne: true } }` sorted by the
  // date key. `isArchived: { $ne: true }` is a RANGE, so putting it before the
  // sort key would break the index ordering and force an in-memory sort anyway
  // (verified via explain). The right shape is EQUALITY-prefix then sort key:
  // `{ tenantId, <sortKey> }`. Mongo walks it in sorted order for the tenant and
  // applies `isArchived` as a cheap residual filter — IXSCAN, no COLLSCAN, no
  // blocking SORT, for both the default and the "show archived" views. Common
  // asset-detail-tab filters (equality on assetId) get their own sort-covering
  // `{ tenantId, assetId, <sortKey> }` index; selective status filters get a
  // plain `{ tenantId, status }`.
  // -------------------------------------------------------------------------

  // assets — default list sorts by createdAt (filter indexes already exist above)
  await ensureIndex(assets, { tenantId: 1, createdAt: -1 });

  // drivers — default list sort
  await ensureIndex(drivers, { tenantId: 1, createdAt: -1 });

  // faults — default list sort + asset-detail tab
  await ensureIndex(faults, { tenantId: 1, createdAt: -1 });
  await ensureIndex(faults, { tenantId: 1, assetId: 1, createdAt: -1 });

  // defects
  const defects = db.collection('defects');
  await ensureIndex(defects, { tenantId: 1, createdAt: -1 });
  await ensureIndex(defects, { tenantId: 1, assetId: 1, createdAt: -1 });
  await ensureIndex(defects, { tenantId: 1, status: 1 });

  // workOrders
  const workOrders = db.collection('workOrders');
  await ensureIndex(workOrders, { tenantId: 1, createdAt: -1 });
  await ensureIndex(workOrders, { tenantId: 1, assetId: 1, createdAt: -1 });
  await ensureIndex(workOrders, { tenantId: 1, statusId: 1 });

  // workOrderStatuses — ordered by sequence
  const workOrderStatuses = db.collection('workOrderStatuses');
  await ensureIndex(workOrderStatuses, { tenantId: 1, sequence: 1 });

  // purchaseOrders
  const purchaseOrders = db.collection('purchaseOrders');
  await ensureIndex(purchaseOrders, { tenantId: 1, createdAt: -1 });
  await ensureIndex(purchaseOrders, { tenantId: 1, status: 1 });

  // parts
  const parts = db.collection('parts');
  await ensureIndex(parts, { tenantId: 1, createdAt: -1 });
  await ensureIndex(parts, { tenantId: 1, categoryId: 1 });

  // vendors
  const vendors = db.collection('vendors');
  await ensureIndex(vendors, { tenantId: 1, createdAt: -1 });

  // servicePlans
  const servicePlans = db.collection('servicePlans');
  await ensureIndex(servicePlans, { tenantId: 1, createdAt: -1 });

  // serviceTasks
  const serviceTasks = db.collection('serviceTasks');
  await ensureIndex(serviceTasks, { tenantId: 1, createdAt: -1 });

  // serviceHistory — per-asset, newest first
  const serviceHistory = db.collection('serviceHistory');
  await ensureIndex(serviceHistory, { tenantId: 1, assetId: 1, performedAt: -1 });

  // fuelTransactions — sorted by date
  const fuelTransactions = db.collection('fuelTransactions');
  await ensureIndex(fuelTransactions, { tenantId: 1, date: -1 });
  await ensureIndex(fuelTransactions, { tenantId: 1, assetId: 1, date: -1 });

  // inspectionSubmissions — sorted by submittedAt
  const inspectionSubmissions = db.collection('inspectionSubmissions');
  await ensureIndex(inspectionSubmissions, { tenantId: 1, submittedAt: -1 });
  await ensureIndex(inspectionSubmissions, { tenantId: 1, assetId: 1, submittedAt: -1 });

  // notifications — per-recipient feed + unread count
  const notifications = db.collection('notifications');
  await ensureIndex(notifications, { tenantId: 1, recipientId: 1, createdAt: -1 });
  await ensureIndex(notifications, { tenantId: 1, recipientId: 1, isRead: 1 });

  // tenantMembers (Users list) — default sort by createdAt
  await ensureIndex(tenantMembers, { tenantId: 1, createdAt: -1 });

  // roles — list sorts by isSystem then createdAt
  await ensureIndex(roles, { tenantId: 1, isSystem: -1, createdAt: -1 });

  // forms — keyed by organizationId, sorted by createdAt
  const forms = db.collection('forms');
  await ensureIndex(forms, { organizationId: 1, createdAt: -1 });

  console.log('Index setup complete');
}
