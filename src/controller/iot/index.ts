/**
 * IoT Hub integration — public surface.
 *
 * Pulls fleet/asset telemetry from the "3PM Cloud IoT Hub" (EROAD / Navman /
 * Blackhawk / Cartrack) into the tenant's `assets` collection. See
 * IOT_INTEGRATION_REQUIREMENTS.md for setup + open decisions.
 */
export { getIoTSettings, saveIoTSettings, markSynced } from './settings-service';
export { syncAssetsFromIoTHub, type SyncResult } from './sync-service';
export { IOT_PROVIDERS } from './types';
export type {
  IoTProvider,
  IoTSettingsInput,
  IoTSettingsResponse,
  ProviderMapping,
} from './types';
