/**
 * IoT Hub client + provider-mapping provisioning.
 *
 * A tenant is represented in the hub as a "Client" that has one "provider
 * mapping" per telematics provider (holding that provider's auth key).
 * `ensureIoTHubClientAndMappings` is idempotent: it creates the client only if
 * we don't already have an id, then creates/updates each provider mapping.
 */
import { ObjectId } from 'mongodb';
import { getIoTSettingsCollection, getTenantsCollection } from '@/lib/mongodb';
import { getIotHubApiBaseUrl } from './api';
import { getProviderCode, getProviderAuthKeys } from './provider';
import type { ProviderMapping } from './types';

/** POST /Client — register the tenant as a hub client, returns its id. */
export async function createIoTHubClient(
  tenantName: string,
  tenantId: ObjectId,
  providerCodes: number[],
  accessToken: string,
): Promise<string> {
  const clientData: Record<string, unknown> = {
    clientName: tenantName,
    externalSourceId: tenantId.toString(),
    isDisabled: false,
  };
  if (providerCodes.length > 0) clientData.providerCode = providerCodes[0];

  const response = await fetch(`${getIotHubApiBaseUrl()}/Client`, {
    method: 'POST',
    headers: { Authorization: accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(clientData),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Failed to create IoT Hub client: ${response.status} - ${errorText || response.statusText}`,
    );
  }
  const data = await response.json();
  if (!data?.id) throw new Error('Client id not found in IoT Hub response.');
  return data.id as string;
}

/** POST /ClientProviderMapping/CreateWithKeyOnly. */
async function createProviderMapping(
  clientId: string,
  providerCode: number,
  authorizationKey: string,
  authorizationUsername: string | undefined,
  accessToken: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    clientId,
    iotProviderCode: providerCode,
    keyOrTokenValue: authorizationKey,
    isDisabled: false,
  };
  if (authorizationUsername) body.keyName = authorizationUsername;

  const response = await fetch(
    `${getIotHubApiBaseUrl()}/ClientProviderMapping/CreateWithKeyOnly`,
    {
      method: 'POST',
      headers: { Authorization: accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Failed to create provider mapping: ${response.status} - ${errorText || response.statusText}`,
    );
  }
  const data = await response.json();
  if (!data?.id) throw new Error('Provider mapping id not found in IoT Hub response.');
  return data.id as string;
}

/** PUT /ClientProviderMapping/ProviderKeyOnly/{id}. */
async function updateProviderMapping(
  mappingId: string,
  clientId: string,
  providerCode: number,
  authorizationKey: string,
  authorizationUsername: string | undefined,
  accessToken: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    clientId,
    iotProviderCode: providerCode,
    keyOrTokenValue: authorizationKey,
    isDisabled: false,
  };
  if (authorizationUsername) body.keyName = authorizationUsername;

  const response = await fetch(
    `${getIotHubApiBaseUrl()}/ClientProviderMapping/ProviderKeyOnly/${mappingId}`,
    {
      method: 'PUT',
      headers: { Authorization: accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Failed to update provider mapping: ${response.status} - ${errorText || response.statusText}`,
    );
  }
  const data = await response.json();
  return data?.id || data?.responseText?.id || mappingId;
}

interface EnsureSettings {
  iotClientId?: string;
  providerNames: string[];
  providerMappings?: Record<string, ProviderMapping>;
  eroadAuthorizationKey: string;
  navmanAuthorizationKey: string;
  blackhawkAuthorizationKey: string;
  cartrackAuthorizationKey: string;
  cartrackAuthorizationUsername: string;
}

/**
 * Ensure the tenant has a hub client id and up-to-date provider mappings.
 * Returns the resolved client id (existing, or newly created).
 */
export async function ensureIoTHubClientAndMappings(
  tenantId: ObjectId,
  settings: EnsureSettings,
  accessToken: string,
): Promise<string> {
  const iotSettingsCollection = await getIoTSettingsCollection();
  const tenantsCollection = await getTenantsCollection();

  let iotClientId = settings.iotClientId;

  // Create the client only if we don't already have (or weren't given) an id.
  if (!iotClientId) {
    const tenant = await tenantsCollection.findOne({ _id: tenantId });
    if (!tenant) throw new Error('Tenant not found');
    const tenantName = (tenant.name as string) || tenantId.toString();

    const providerCodes = settings.providerNames
      .map((p) => getProviderCode(p))
      .filter((c) => c !== 0);
    if (providerCodes.length === 0) {
      throw new Error('No valid providers configured. Configure at least one provider.');
    }

    iotClientId = await createIoTHubClient(tenantName, tenantId, providerCodes, accessToken);
    await iotSettingsCollection.updateOne({ tenantId }, { $set: { iotClientId } });
  }

  // Create/update a mapping per configured provider (best-effort per provider).
  const providerMappings: Record<string, ProviderMapping> = settings.providerMappings || {};
  const updated: Record<string, ProviderMapping> = { ...providerMappings };

  for (const providerName of settings.providerNames) {
    const providerCode = getProviderCode(providerName);
    if (providerCode === 0) continue;

    const { authorizationKey, authorizationUsername } = getProviderAuthKeys(providerName, settings);
    if (!authorizationKey) continue;

    const existing = providerMappings[providerName];
    try {
      const mappingId =
        !existing || !existing.providerMappingId
          ? await createProviderMapping(
              iotClientId,
              providerCode,
              authorizationKey,
              authorizationUsername,
              accessToken,
            )
          : await updateProviderMapping(
              existing.providerMappingId,
              iotClientId,
              providerCode,
              authorizationKey,
              authorizationUsername,
              accessToken,
            );
      updated[providerName] = { providerMappingId: mappingId, authorizationKey, authorizationUsername };
    } catch (error) {
      console.error(`[IoT] Error managing provider mapping for ${providerName}:`, error);
    }
  }

  await iotSettingsCollection.updateOne({ tenantId }, { $set: { providerMappings: updated } });
  return iotClientId;
}
