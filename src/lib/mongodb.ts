/**
 * MongoDB native driver connection — singleton client reused across requests.
 *
 * Convention: one `getXCollection()` helper per domain collection.
 * Every collection carries `tenantId` as the lead field.
 */
import { MongoClient, Db, Collection } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'asset-manager';

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI environment variable is not set');
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  // Reuse client across HMR in development
  const g = globalThis as typeof globalThis & { _mongoClientPromise?: Promise<MongoClient> };
  if (!g._mongoClientPromise) {
    client = new MongoClient(MONGODB_URI);
    g._mongoClientPromise = client.connect();
  }
  clientPromise = g._mongoClientPromise;
} else {
  client = new MongoClient(MONGODB_URI);
  clientPromise = client.connect();
}

export default clientPromise;
export { clientPromise };

/** Get the application database. */
export async function getDb(): Promise<Db> {
  const c = await clientPromise;
  return c.db(MONGODB_DB_NAME);
}

// ---------------------------------------------------------------------------
// Auth collections (NextAuth + custom)
// ---------------------------------------------------------------------------

export async function getUsersCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('users');
}

export async function getSessionsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('sessions');
}

export async function getTenantsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('tenants');
}

export async function getTenantMembersCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('tenantMembers');
}

export async function getWorkspacesCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('workspaces');
}

export async function getWorkspaceMembersCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('workspaceMembers');
}

// ---------------------------------------------------------------------------
// Identity & Access collections
// ---------------------------------------------------------------------------

export async function getMembersCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('members');
}

export async function getTeamsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('teams');
}

export async function getRolesCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('roles');
}

export async function getInvitationsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('invitations');
}

// ---------------------------------------------------------------------------
// Assets collections
// ---------------------------------------------------------------------------

export async function getAssetsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('assets');
}

export async function getAssetGroupsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('assetGroups');
}

export async function getLocationsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('locations');
}

export async function getDocumentsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('documents');
}

export async function getMeterReadingsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('meterReadings');
}

export async function getAssetTypesCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('assetTypes');
}

// ---------------------------------------------------------------------------
// Drivers collection
// ---------------------------------------------------------------------------

export async function getDriversCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('drivers');
}

// ---------------------------------------------------------------------------
// Vendors collection
// ---------------------------------------------------------------------------

export async function getVendorsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('vendors');
}

// ---------------------------------------------------------------------------
// Maintenance collections
// ---------------------------------------------------------------------------

export async function getServiceTasksCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('serviceTasks');
}

export async function getServiceProgramsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('servicePrograms');
}

// ---------------------------------------------------------------------------
// Inventory collections
// ---------------------------------------------------------------------------

export async function getPartsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('parts');
}

export async function getMeasurementUnitsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('measurementUnits');
}

export async function getPartCategoriesCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('partCategories');
}

export async function getPartLocationsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('partLocations');
}

// ---------------------------------------------------------------------------
// Purchase Orders collection
// ---------------------------------------------------------------------------

export async function getPurchaseOrdersCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('purchaseOrders');
}

// ---------------------------------------------------------------------------
// Work Orders collections
// ---------------------------------------------------------------------------

export async function getWorkOrderStatusesCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('workOrderStatuses');
}

export async function getWorkOrdersCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('workOrders');
}

// ---------------------------------------------------------------------------
// Defects collection
// ---------------------------------------------------------------------------

export async function getDefectsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('defects');
}

// ---------------------------------------------------------------------------
// Faults collection
// ---------------------------------------------------------------------------

export async function getFaultsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('faults');
}

// ---------------------------------------------------------------------------
// Fuel collection
// ---------------------------------------------------------------------------

export async function getFuelTransactionsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('fuelTransactions');
}

// ---------------------------------------------------------------------------
// Cross-cutting collections
// ---------------------------------------------------------------------------

export async function getCountersCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('counters');
}

export async function getAuditLogCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('auditLog');
}

// ---------------------------------------------------------------------------
// Form Builder embed session cache
// ---------------------------------------------------------------------------

export async function getFormBuilderSessionsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('formBuilderSessions');
}

// ---------------------------------------------------------------------------
// Widget Builder embed session cache + per-tenant embed tokens
// ---------------------------------------------------------------------------

export async function getWidgetBuilderSessionsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('widgetBuilderSessions');
}

export async function getEmbedTokensCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('embedTokens');
}

// ---------------------------------------------------------------------------
// Form Builder – local form storage & org→tenant mapping
// ---------------------------------------------------------------------------

export async function getFormsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('forms');
}

export async function getFormBuilderOrgMappingsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('formBuilderOrgMappings');
}

// ---------------------------------------------------------------------------
// Pre-start defect settings
// ---------------------------------------------------------------------------

export async function getPrestartFormDefectSettingsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('prestartFormDefectSettings');
}

// ---------------------------------------------------------------------------
// Inspection submissions
// ---------------------------------------------------------------------------

export async function getInspectionSubmissionsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('inspectionSubmissions');
}

export async function getInspectionLaunchesCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('inspectionLaunches');
}

// ---------------------------------------------------------------------------
// In-app notifications
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Buddy AI chat
// ---------------------------------------------------------------------------

export async function getBuddyChatThreadsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('buddyChatThreads');
}

export async function getNotificationsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('notifications');
}

// ---------------------------------------------------------------------------
// Service history (completed preventative-maintenance services)
// ---------------------------------------------------------------------------

export async function getServiceHistoryCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection('serviceHistory');
}

// ---------------------------------------------------------------------------
