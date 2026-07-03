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

  console.log('All indexes created successfully');
}
