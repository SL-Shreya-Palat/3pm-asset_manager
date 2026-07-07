/**
 * IoT Hub HTTP client — session token + device fetch.
 *
 * SECURITY: credentials come ONLY from env (IOT_HUB_USERNAME/PASSWORD). Unlike
 * the construction-portal original, there are no hardcoded fallback credentials
 * — if the env vars are missing we throw, so a secret is never shipped.
 */

/** Base URL for the IoT Hub REST API (env-overridable). */
export function getIotHubApiBaseUrl(): string {
  return (
    process.env.IOT_HUB_API_BASE_URL ||
    'https://3pmcloud-iothub-prod.azurewebsites.net/api/v1'
  );
}

/**
 * Log in to the IoT Hub (POST /Session) and return a `Bearer <jwt>` header value.
 */
export async function generateAccessToken(): Promise<string> {
  const baseUrl = getIotHubApiBaseUrl();
  const username = process.env.IOT_HUB_USERNAME;
  const password = process.env.IOT_HUB_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'IoT Hub credentials not configured — set IOT_HUB_USERNAME and IOT_HUB_PASSWORD.',
    );
  }

  const response = await fetch(`${baseUrl}/Session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Failed to generate IoT Hub access token: ${response.status} - ${errorText || response.statusText}`,
    );
  }

  const data = await response.json();
  const jwt = data?.jwt;
  if (!jwt) {
    throw new Error('JWT token not found in IoT Hub session response.');
  }
  return `Bearer ${jwt}`;
}

/** Raw device shape returned by the IoT Hub /Asset endpoint. */
export interface IoTDevice {
  iotId?: string;
  registrationNumber?: string;
  make?: string;
  model?: string;
  yearOfManufacture?: number;
  colour?: string;
  hours?: number;
  odoMeter?: number;
  huboSerialNumber?: number;
  assetType?: string;
  fleetName?: string;
  latitude?: number;
  longitude?: number;
  wofOrCof?: string;
  wofOrCofExpiry?: string;
  regoExpiry?: string;
  deviceSerialNumber?: string;
  chassisNumber?: string;
  deviceType?: string;
  isRUC?: boolean;
  vinNumber?: string;
  grossMassWeight?: number;
  lastReadingAt?: string;
  iotProviderName?: string;
  RucDueInKm?: number;
}

/**
 * Fetch all devices for a hub client (GET /Asset?clientId=). Tolerates the
 * hub's several response shapes (array / {responseText} / {data}).
 */
export async function fetchAssetsFromIoTHub(
  clientId: string,
  accessToken: string,
): Promise<IoTDevice[]> {
  const baseUrl = getIotHubApiBaseUrl();
  const response = await fetch(`${baseUrl}/Asset?clientId=${clientId}`, {
    method: 'GET',
    headers: { Authorization: accessToken, 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `IoT Hub API error: ${response.status} - ${errorText || response.statusText}`,
    );
  }
  if (response.status === 204) return [];

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) return [];

  const text = await response.text();
  if (!text || text.trim() === '') return [];

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    console.error('[IoT] Failed to parse /Asset response:', error);
    return [];
  }

  if (Array.isArray(data)) return data as IoTDevice[];
  const obj = data as { responseText?: unknown; data?: unknown };
  if (obj.responseText) {
    const parsed =
      typeof obj.responseText === 'string' ? JSON.parse(obj.responseText) : obj.responseText;
    return Array.isArray(parsed) ? (parsed as IoTDevice[]) : [];
  }
  if (Array.isArray(obj.data)) return obj.data as IoTDevice[];
  return [];
}
