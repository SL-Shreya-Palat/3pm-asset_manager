/**
 * 3PM Auth Data API client for users and invitations.
 * Pre-registers users and creates invitations on 3pm-auth so invited users
 * get a direct login experience (no registration flow) when they accept.
 *
 * Mirrors construction-portal/lib/3pm-data-api.ts.
 */

const IDP_URL = process.env.IDP_URL;
const DATA_API_KEY = process.env.DATA_API_KEY;
const AUTH_CLIENT_ID = process.env.AUTH_CLIENT_ID;

function getConfig() {
  if (!IDP_URL || !DATA_API_KEY || !AUTH_CLIENT_ID) {
    throw new Error(
      '3PM Data API requires IDP_URL, DATA_API_KEY, and AUTH_CLIENT_ID',
    );
  }
  return { idpUrl: IDP_URL, apiKey: DATA_API_KEY, clientId: AUTH_CLIENT_ID };
}

/** Check if 3PM Data API is configured (for feature flag). */
export function is3PMDataApiConfigured(): boolean {
  return !!(IDP_URL && DATA_API_KEY && AUTH_CLIENT_ID);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface Create3PMUserParams {
  email: string;
  firstName: string;
  lastName: string;
  mobile?: string;
}

export interface ThreePMUserResult {
  id: string;
  email: string;
  status: 'created' | 'skipped';
  existingUserId?: string;
}

/**
 * Pre-register a user in 3pm-auth via the Data API.
 *
 * The user is created with empty `providers: []` — they verify via OTP on
 * first login. If the email already exists the endpoint returns
 * `status: "skipped"` (not an error), so this is safe to call every time.
 */
export async function create3PMUser(
  params: Create3PMUserParams,
): Promise<ThreePMUserResult> {
  const { idpUrl, apiKey } = getConfig();

  // 3pm-auth only accepts a mobile in strict E.164 format (+countrycode…).
  // A locally-entered number that isn't E.164 (e.g. "6787678989") would make
  // the whole user-creation request fail validation — which silently drops the
  // user from 3pm-auth and forces them through the registration flow on first
  // login. So only forward the mobile when it's already E.164; otherwise omit
  // it and still create the user (the local record keeps the number).
  const trimmedMobile = params.mobile?.trim();
  const e164Mobile =
    trimmedMobile && /^\+[1-9]\d{7,14}$/.test(trimmedMobile) ? trimmedMobile : undefined;

  const res = await fetch(`${idpUrl}/api/data/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      email: params.email.toLowerCase().trim(),
      firstName: params.firstName.trim(),
      lastName: params.lastName.trim(),
      ...(e164Mobile ? { mobile: e164Mobile } : {}),
    }),
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(data.error);
  }
  if (!data.data) {
    throw new Error('No data in 3PM user creation response');
  }

  return data.data;
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export interface ThreePMInvitation {
  id: string;
  tenantId: string;
  email: string;
  role: 'admin' | 'member';
  assignedApps?: string[];
  status: 'pending' | 'accepted' | 'cancelled';
  expiresAt: string;
  createdAt: string;
}

export interface Create3PMInvitationParams {
  tenantId: string;
  email: string;
  role: 'admin' | 'member';
  assignedApps?: string[];
  inviterName?: string;
  inviterEmail?: string;
  recipientName?: string;
  roleLabel?: string;
}

/**
 * Create invitation via 3PM Data API. 3PM sends the email.
 */
export async function create3PMInvitation(
  params: Create3PMInvitationParams,
): Promise<ThreePMInvitation> {
  const { idpUrl, apiKey, clientId } = getConfig();

  // Only forward defined context fields so 3PM's zod schema doesn't reject
  // explicit empty strings.
  const context: Record<string, string> = {};
  const ctxFields = [
    'inviterName',
    'inviterEmail',
    'recipientName',
    'roleLabel',
  ] as const;
  for (const field of ctxFields) {
    const v = params[field];
    if (typeof v === 'string' && v.trim().length > 0) {
      context[field] = v.trim();
    }
  }

  const res = await fetch(`${idpUrl}/api/data/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      tenantId: params.tenantId,
      email: params.email.toLowerCase().trim(),
      role: params.role,
      assignedApps: params.assignedApps ?? [clientId],
      ...context,
    }),
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(data.error);
  }
  if (!data.data) {
    throw new Error('No data in 3PM invitation response');
  }

  return data.data;
}
