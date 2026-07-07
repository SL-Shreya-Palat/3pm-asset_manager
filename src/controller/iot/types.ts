import type { ObjectId } from 'mongodb';

/**
 * IoT Hub integration types.
 *
 * The "3PM Cloud IoT Hub" is a REST API (hosted on Azure) that aggregates
 * telematics from EROAD / Navman / Blackhawk / Cartrack. Per tenant we store a
 * client id (the hub's handle for the organization) plus the provider auth keys.
 */

export const IOT_PROVIDERS = ['EROAD', 'NAVMAN', 'BLACKHAWK', 'CARTRACK'] as const;
export type IoTProvider = (typeof IOT_PROVIDERS)[number];

export interface ProviderMapping {
  providerMappingId?: string;
  authorizationKey: string;
  /** CARTRACK only. */
  authorizationUsername?: string;
}

export interface IoTSettingsDocument {
  _id: ObjectId;
  tenantId: ObjectId;
  providerNames: string[];
  navmanAuthorizationKey: string;
  eroadAuthorizationKey: string;
  blackhawkAuthorizationKey: string;
  cartrackAuthorizationKey: string;
  cartrackAuthorizationUsername: string;
  /** IoT Hub client id — the hub's handle for this tenant/org. */
  iotClientId?: string;
  /** Provider name → mapping (created lazily against the hub). */
  providerMappings?: Record<string, ProviderMapping>;
  /** Whether the hourly auto-sync is enabled for this tenant. */
  autoSyncEnabled?: boolean;
  lastSyncedAt?: Date | null;
  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IoTSettingsInput {
  providerNames: string[];
  navmanAuthorizationKey?: string;
  eroadAuthorizationKey?: string;
  blackhawkAuthorizationKey?: string;
  cartrackAuthorizationKey?: string;
  cartrackAuthorizationUsername?: string;
  /** Optional: link an existing hub client id (e.g. migrated from Zoho). */
  iotClientId?: string;
  autoSyncEnabled?: boolean;
}

export interface IoTSettingsResponse {
  id: string;
  tenantId: string;
  providerNames: string[];
  navmanAuthorizationKey: string;
  eroadAuthorizationKey: string;
  blackhawkAuthorizationKey: string;
  cartrackAuthorizationKey: string;
  cartrackAuthorizationUsername: string;
  iotClientId?: string;
  providerMappings?: Record<string, ProviderMapping>;
  autoSyncEnabled: boolean;
  lastSyncedAt: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
