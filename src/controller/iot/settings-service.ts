/**
 * Per-tenant IoT settings CRUD (the `iotSettings` collection).
 */
import { ObjectId } from 'mongodb';
import { getIoTSettingsCollection } from '@/lib/mongodb';
import { IOT_PROVIDERS } from './types';
import type { IoTSettingsInput, IoTSettingsResponse, IoTSettingsDocument } from './types';

function serialize(doc: IoTSettingsDocument): IoTSettingsResponse {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId.toString(),
    providerNames: doc.providerNames || [],
    navmanAuthorizationKey: doc.navmanAuthorizationKey || '',
    eroadAuthorizationKey: doc.eroadAuthorizationKey || '',
    blackhawkAuthorizationKey: doc.blackhawkAuthorizationKey || '',
    cartrackAuthorizationKey: doc.cartrackAuthorizationKey || '',
    cartrackAuthorizationUsername: doc.cartrackAuthorizationUsername || '',
    iotClientId: doc.iotClientId || undefined,
    providerMappings: doc.providerMappings || undefined,
    autoSyncEnabled: doc.autoSyncEnabled ?? false,
    lastSyncedAt: doc.lastSyncedAt ? new Date(doc.lastSyncedAt).toISOString() : null,
    createdBy: doc.createdBy?.toString() || '',
    updatedBy: doc.updatedBy?.toString() || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Get IoT settings for a tenant (empty defaults when none exist). */
export async function getIoTSettings(tenantId: ObjectId): Promise<IoTSettingsResponse> {
  const collection = await getIoTSettingsCollection();
  const doc = (await collection.findOne({ tenantId })) as IoTSettingsDocument | null;
  if (!doc) {
    const now = new Date();
    return {
      id: '',
      tenantId: tenantId.toString(),
      providerNames: [],
      navmanAuthorizationKey: '',
      eroadAuthorizationKey: '',
      blackhawkAuthorizationKey: '',
      cartrackAuthorizationKey: '',
      cartrackAuthorizationUsername: '',
      iotClientId: undefined,
      providerMappings: undefined,
      autoSyncEnabled: false,
      lastSyncedAt: null,
      createdBy: '',
      updatedBy: '',
      createdAt: now,
      updatedAt: now,
    };
  }
  return serialize(doc);
}

/** Create or update IoT settings for a tenant. Preserves client id + mappings. */
export async function saveIoTSettings(
  input: IoTSettingsInput,
  tenantId: ObjectId,
  userId: string,
): Promise<IoTSettingsResponse> {
  const invalid = (input.providerNames || []).filter(
    (p) => !IOT_PROVIDERS.includes(p.toUpperCase() as (typeof IOT_PROVIDERS)[number]),
  );
  if (invalid.length > 0) {
    throw new Error(
      `Invalid provider names: ${invalid.join(', ')}. Valid: ${IOT_PROVIDERS.join(', ')}`,
    );
  }
  const providerNames = (input.providerNames || []).map((p) => p.toUpperCase());
  const userOid = ObjectId.createFromHexString(userId);
  const now = new Date();
  const collection = await getIoTSettingsCollection();

  const set: Record<string, unknown> = {
    providerNames,
    navmanAuthorizationKey: input.navmanAuthorizationKey || '',
    eroadAuthorizationKey: input.eroadAuthorizationKey || '',
    blackhawkAuthorizationKey: input.blackhawkAuthorizationKey || '',
    cartrackAuthorizationKey: input.cartrackAuthorizationKey || '',
    cartrackAuthorizationUsername: input.cartrackAuthorizationUsername || '',
    autoSyncEnabled: input.autoSyncEnabled ?? false,
    updatedBy: userOid,
    updatedAt: now,
  };
  // Only overwrite the client id when the caller explicitly provides one (e.g.
  // linking an existing/migrated hub org). Otherwise it's owned by the sync flow.
  if (input.iotClientId) set.iotClientId = input.iotClientId;

  await collection.updateOne(
    { tenantId },
    {
      $set: set,
      $setOnInsert: { tenantId, createdBy: userOid, createdAt: now },
    },
    { upsert: true },
  );

  const doc = (await collection.findOne({ tenantId })) as IoTSettingsDocument;
  return serialize(doc);
}

/** Stamp the last successful sync time. */
export async function markSynced(tenantId: ObjectId): Promise<void> {
  const collection = await getIoTSettingsCollection();
  await collection.updateOne({ tenantId }, { $set: { lastSyncedAt: new Date() } });
}
