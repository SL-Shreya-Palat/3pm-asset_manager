/**
 * Simple auth logging utility — matches construction-portal's auth-logger interface.
 */
const PREFIX = '[auth]';

export const authLog = {
  api: {
    login(pathname: string, callbackUrl: string) {
      console.log(`${PREFIX} login redirect: ${pathname} → ${callbackUrl}`);
    },
    tenantSwitch(userId: string, fromTenant: string | null, toTenant: string) {
      console.log(`${PREFIX} tenant switch: user=${userId} from=${fromTenant} to=${toTenant}`);
    },
  },
  authHelper: {
    getAuthUser(userId: string, source: 'web' | 'mobile') {
      console.log(`${PREFIX} auth user resolved: id=${userId} source=${source}`);
    },
    resolveTenant(source: string, tenantId: string, authTenantId: string) {
      console.log(`${PREFIX} tenant resolved: source=${source} localId=${tenantId} authId=${authTenantId}`);
    },
  },
};
