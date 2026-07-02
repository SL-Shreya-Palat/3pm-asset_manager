/**
 * 3PM Auth Data API client for invitations.
 * Delegates invitation creation to 3pm-auth so users get a direct login
 * experience (no registration flow) when they accept an invite.
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
