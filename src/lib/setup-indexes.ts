/**
 * Centralized index creation — run once at deploy or on demand.
 *
 * Every compound index is tenant-led (`tenantId` first).
 * Call `setupIndexes()` from a one-time script or API route.
 */
import { getDb } from './mongodb';

export async function setupIndexes(): Promise<void> {
  const db = await getDb();

  // --- members ---
  const members = db.collection('members');
  await members.createIndex({ tenantId: 1, status: 1 });
  await members.createIndex({ tenantId: 1, roleId: 1 });
  await members.createIndex({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
  await members.createIndex({ tenantId: 1, authUserId: 1 }, { unique: true, sparse: true });
  await members.createIndex({ tenantId: 1, 'driver.teamIds': 1 });
  await members.createIndex({ tenantId: 1, 'driver.license.expiresAt': 1 });

  // --- teams ---
  const teams = db.collection('teams');
  await teams.createIndex({ tenantId: 1, nameLower: 1 }, { unique: true });
  await teams.createIndex({ tenantId: 1, managerIds: 1 });
  await teams.createIndex({ tenantId: 1, isArchived: 1 });

  // --- roles ---
  const roles = db.collection('roles');
  await roles.createIndex({ tenantId: 1, nameLower: 1 }, { unique: true });
  await roles.createIndex({ tenantId: 1, key: 1 });
  await roles.createIndex({ tenantId: 1, isSystem: 1 });

  // --- invitations ---
  const invitations = db.collection('invitations');
  await invitations.createIndex({ tenantId: 1, status: 1 });
  await invitations.createIndex({ tenantId: 1, email: 1, status: 1 });
  await invitations.createIndex({ tenantId: 1, tokenHash: 1 }, { unique: true });
  await invitations.createIndex({ tenantId: 1, expiresAt: 1 });

  // --- assets ---
  const assets = db.collection('assets');
  await assets.createIndex({ tenantId: 1, status: 1 });
  await assets.createIndex({ tenantId: 1, assetNumber: 1 }, { unique: true, sparse: true });
  await assets.createIndex({ tenantId: 1, teamIds: 1 });
  await assets.createIndex({ tenantId: 1, assetGroupIds: 1 });
  await assets.createIndex({ tenantId: 1, qrCode: 1 }, { unique: true, sparse: true });
  await assets.createIndex({ tenantId: 1, isArchived: 1 });

  // --- drivers ---
  const drivers = db.collection('drivers');
  await drivers.createIndex({ tenantId: 1, isArchived: 1 });
  await drivers.createIndex({ tenantId: 1, teamId: 1 });
  await drivers.createIndex({ tenantId: 1, email: 1 }, { sparse: true });
  await drivers.createIndex({ tenantId: 1, employeeNumber: 1 }, { sparse: true });
  await drivers.createIndex({ tenantId: 1, licenseNumber: 1 }, { sparse: true });
  await drivers.createIndex({ tenantId: 1, tenantMemberId: 1 }, { sparse: true });

  // --- assetTypes ---
  const assetTypes = db.collection('assetTypes');
  await assetTypes.createIndex({ tenantId: 1, nameLower: 1 }, { unique: true });
  await assetTypes.createIndex({ tenantId: 1, isArchived: 1 });

  // --- assetGroups ---
  const assetGroups = db.collection('assetGroups');
  await assetGroups.createIndex({ tenantId: 1, nameLower: 1 }, { unique: true });

  // --- locations ---
  const locations = db.collection('locations');
  await locations.createIndex({ tenantId: 1, name: 1 });

  // --- documents ---
  const documents = db.collection('documents');
  await documents.createIndex({ tenantId: 1, scope: 1, assetId: 1 });
  await documents.createIndex({ tenantId: 1, scope: 1, driverId: 1 });
  await documents.createIndex({ tenantId: 1, expiryDate: 1 });

  // --- meterReadings ---
  const meterReadings = db.collection('meterReadings');
  await meterReadings.createIndex({ tenantId: 1, assetId: 1, meterType: 1, readingAt: -1 });

  // --- counters ---
  const counters = db.collection('counters');
  await counters.createIndex({ tenantId: 1, name: 1 }, { unique: true });

  // --- users (auth lookup + provisioning upsert) ---
  const users = db.collection('users');
  await users.createIndex({ authUserId: 1 }, { unique: true, sparse: true });
  await users.createIndex({ email: 1 }, { unique: true, sparse: true });

  // --- tenants (auth lookup) ---
  const tenants = db.collection('tenants');
  await tenants.createIndex({ authTenantId: 1 }, { unique: true, sparse: true });

  // --- tenantMembers (auth lookup + provisioning upsert) ---
  const tenantMembers = db.collection('tenantMembers');
  await tenantMembers.createIndex({ userId: 1, tenantId: 1 }, { unique: true, sparse: true });
  await tenantMembers.createIndex({ userId: 1, isActive: 1 });
  await tenantMembers.createIndex({ tenantId: 1, isActive: 1 });
  await tenantMembers.createIndex({ tenantId: 1, email: 1 }, { sparse: true });
  await tenantMembers.createIndex({ tenantId: 1, status: 1 });

  // --- faults ---
  const faults = db.collection('faults');
  await faults.createIndex({ tenantId: 1, status: 1 });
  await faults.createIndex({ tenantId: 1, assetId: 1 });
  await faults.createIndex({ tenantId: 1, isArchived: 1 });
  await faults.createIndex({ tenantId: 1, faultNumber: 1 }, { unique: true, sparse: true });

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
  await assets.createIndex({ tenantId: 1, createdAt: -1 });

  // drivers — default list sort
  await drivers.createIndex({ tenantId: 1, createdAt: -1 });

  // faults — default list sort + asset-detail tab
  await faults.createIndex({ tenantId: 1, createdAt: -1 });
  await faults.createIndex({ tenantId: 1, assetId: 1, createdAt: -1 });

  // defects
  const defects = db.collection('defects');
  await defects.createIndex({ tenantId: 1, createdAt: -1 });
  await defects.createIndex({ tenantId: 1, assetId: 1, createdAt: -1 });
  await defects.createIndex({ tenantId: 1, status: 1 });

  // workOrders
  const workOrders = db.collection('workOrders');
  await workOrders.createIndex({ tenantId: 1, createdAt: -1 });
  await workOrders.createIndex({ tenantId: 1, assetId: 1, createdAt: -1 });
  await workOrders.createIndex({ tenantId: 1, statusId: 1 });

  // workOrderStatuses — ordered by sequence
  const workOrderStatuses = db.collection('workOrderStatuses');
  await workOrderStatuses.createIndex({ tenantId: 1, sequence: 1 });

  // purchaseOrders
  const purchaseOrders = db.collection('purchaseOrders');
  await purchaseOrders.createIndex({ tenantId: 1, createdAt: -1 });
  await purchaseOrders.createIndex({ tenantId: 1, status: 1 });

  // parts
  const parts = db.collection('parts');
  await parts.createIndex({ tenantId: 1, createdAt: -1 });
  await parts.createIndex({ tenantId: 1, categoryId: 1 });

  // vendors
  const vendors = db.collection('vendors');
  await vendors.createIndex({ tenantId: 1, createdAt: -1 });

  // servicePlans
  const servicePlans = db.collection('servicePlans');
  await servicePlans.createIndex({ tenantId: 1, createdAt: -1 });

  // serviceTasks
  const serviceTasks = db.collection('serviceTasks');
  await serviceTasks.createIndex({ tenantId: 1, createdAt: -1 });

  // serviceHistory — per-asset, newest first
  const serviceHistory = db.collection('serviceHistory');
  await serviceHistory.createIndex({ tenantId: 1, assetId: 1, performedAt: -1 });

  // fuelTransactions — sorted by date
  const fuelTransactions = db.collection('fuelTransactions');
  await fuelTransactions.createIndex({ tenantId: 1, date: -1 });
  await fuelTransactions.createIndex({ tenantId: 1, assetId: 1, date: -1 });

  // inspectionSubmissions — sorted by submittedAt
  const inspectionSubmissions = db.collection('inspectionSubmissions');
  await inspectionSubmissions.createIndex({ tenantId: 1, submittedAt: -1 });
  await inspectionSubmissions.createIndex({ tenantId: 1, assetId: 1, submittedAt: -1 });

  // notifications — per-recipient feed + unread count
  const notifications = db.collection('notifications');
  await notifications.createIndex({ tenantId: 1, recipientId: 1, createdAt: -1 });
  await notifications.createIndex({ tenantId: 1, recipientId: 1, isRead: 1 });

  // tenantMembers (Users list) — default sort by createdAt
  await tenantMembers.createIndex({ tenantId: 1, createdAt: -1 });

  // roles — list sorts by isSystem then createdAt
  await roles.createIndex({ tenantId: 1, isSystem: -1, createdAt: -1 });

  // forms — keyed by organizationId, sorted by createdAt
  const forms = db.collection('forms');
  await forms.createIndex({ organizationId: 1, createdAt: -1 });

  console.log('All indexes created successfully');
}
