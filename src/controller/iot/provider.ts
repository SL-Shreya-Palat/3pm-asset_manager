/**
 * Provider code + auth-key resolution for the IoT Hub.
 */

/** IoT Hub numeric code for each supported telematics provider. */
export function getProviderCode(providerName: string): number {
  const map: Record<string, number> = {
    EROAD: 101,
    NAVMAN: 102,
    BLACKHAWK: 103,
    CARTRACK: 104,
  };
  return map[providerName.toUpperCase()] || 0;
}

interface ProviderKeySource {
  eroadAuthorizationKey: string;
  navmanAuthorizationKey: string;
  blackhawkAuthorizationKey: string;
  cartrackAuthorizationKey: string;
  cartrackAuthorizationUsername: string;
}

/** Pull the right auth key (+ username for Cartrack) for a provider. */
export function getProviderAuthKeys(
  providerName: string,
  settings: ProviderKeySource,
): { authorizationKey: string; authorizationUsername?: string } {
  switch (providerName.toUpperCase()) {
    case 'EROAD':
      return { authorizationKey: settings.eroadAuthorizationKey };
    case 'NAVMAN':
      return { authorizationKey: settings.navmanAuthorizationKey };
    case 'BLACKHAWK':
      return { authorizationKey: settings.blackhawkAuthorizationKey };
    case 'CARTRACK':
      return {
        authorizationKey: settings.cartrackAuthorizationKey,
        authorizationUsername: settings.cartrackAuthorizationUsername,
      };
    default:
      return { authorizationKey: '' };
  }
}
