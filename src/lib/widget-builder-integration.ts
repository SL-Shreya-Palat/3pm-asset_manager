/**
 * Integration with widget-builder embed API.
 *
 * Session-based, mirroring construction-portal: the backend authenticates
 * with app-secret to onboard tenants and mint short-lived session IDs that
 * the embedded iframe uses. Raw embed tokens never leave the backend.
 *
 * Env:
 * - `NEXT_PUBLIC_WIDGET_BUILDER_URL` — widget-builder base URL
 * - `WIDGET_BUILDER_APP_ID` — Widget Builder connected-app ObjectId
 * - `WIDGET_BUILDER_APP_SECRET` — App secret for backend-to-backend auth
 */

export const WIDGET_BUILDER_APP_NAME = 'widget-builder';

export const WIDGET_BUILDER_BASE_URL =
  process.env.NEXT_PUBLIC_WIDGET_BUILDER_URL || 'http://localhost:3003';
export const WIDGET_BUILDER_APP_ID = process.env.WIDGET_BUILDER_APP_ID || '';
export const WIDGET_BUILDER_APP_SECRET = process.env.WIDGET_BUILDER_APP_SECRET || '';

export interface WidgetBuilderOnboardResult {
  organizationId: string;
  token: string;
  tokenId: string;
}

export interface WidgetBuilderSessionResult {
  ok: boolean;
  status: number;
  data?: { sessionId: string; expiresAt: string };
  error?: string;
}

/**
 * Onboard a tenant to widget-builder: creates the organization, an owner
 * user, a membership, and an org-scoped embed token in one atomic call.
 * Returns the embed token which must be stored server-side only.
 */
export async function onboardToWidgetBuilder(params: {
  organizationName: string;
  firstName: string;
  lastName: string;
  email: string;
}): Promise<WidgetBuilderOnboardResult | null> {
  if (!WIDGET_BUILDER_APP_ID || !WIDGET_BUILDER_APP_SECRET) {
    console.error(
      '[WIDGET_BUILDER] Missing WIDGET_BUILDER_APP_ID or WIDGET_BUILDER_APP_SECRET — cannot onboard',
    );
    return null;
  }

  try {
    const response = await fetch(`${WIDGET_BUILDER_BASE_URL}/api/embed/onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Secret': WIDGET_BUILDER_APP_SECRET,
      },
      body: JSON.stringify({
        organizationName: params.organizationName,
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        appId: WIDGET_BUILDER_APP_ID,
        allowedDomains: [],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(
        '[WIDGET_BUILDER] Failed to onboard tenant:',
        response.status,
        errorData.error || response.statusText,
      );
      return null;
    }

    const json = await response.json();
    const data = json.data;
    if (!data?.organization?.id || !data?.embedToken?.token) {
      console.error('[WIDGET_BUILDER] Onboard call did not return expected data');
      return null;
    }

    return {
      organizationId: data.organization.id,
      token: data.embedToken.token,
      tokenId: data.embedToken.id,
    };
  } catch (error) {
    console.error('[WIDGET_BUILDER] Error onboarding tenant:', error);
    return null;
  }
}

/**
 * Call widget-builder's POST /api/embed/sessions.
 * Passes all 3 layers: appId + appSecret (app), embedToken (org), userEmail (user).
 */
export async function createWidgetBuilderSession(
  userEmail: string,
  embedToken: string,
): Promise<WidgetBuilderSessionResult> {
  if (!WIDGET_BUILDER_APP_ID || !WIDGET_BUILDER_APP_SECRET) {
    return {
      ok: false,
      status: 500,
      error:
        'Widget Builder integration not configured. Set WIDGET_BUILDER_APP_ID and WIDGET_BUILDER_APP_SECRET.',
    };
  }

  try {
    const response = await fetch(`${WIDGET_BUILDER_BASE_URL}/api/embed/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: WIDGET_BUILDER_APP_ID,
        appSecret: WIDGET_BUILDER_APP_SECRET,
        userEmail,
        embedToken,
      }),
    });

    const result = await response.json();

    if (response.ok && result.data?.sessionId) {
      return {
        ok: true,
        status: 200,
        data: {
          sessionId: result.data.sessionId,
          expiresAt: result.data.expiresAt,
        },
      };
    }

    return {
      ok: false,
      status: response.status,
      error: result.error || 'Failed to create widget builder session',
    };
  } catch (error) {
    console.error('[WIDGET_BUILDER] Error calling session API:', error);
    return {
      ok: false,
      status: 500,
      error: 'Failed to connect to Widget Builder',
    };
  }
}

/**
 * Create a member user in widget-builder under the organization bound to the
 * embed token. Used when the org is onboarded but this user doesn't exist yet.
 * HTTP 409 (already a member) is treated as success — idempotent.
 */
export async function createWidgetBuilderMember(params: {
  email: string;
  firstName: string;
  lastName: string;
  embedToken: string;
  role?: 'owner' | 'admin' | 'user';
}): Promise<boolean> {
  try {
    const response = await fetch(`${WIDGET_BUILDER_BASE_URL}/api/embed/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Embed-Token': params.embedToken,
      },
      body: JSON.stringify({
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        role: params.role || 'user',
      }),
    });

    if (response.ok || response.status === 409) {
      return true;
    }

    const data = await response.json().catch(() => ({}));
    console.error(
      '[WIDGET_BUILDER] Failed to create member:',
      response.status,
      data.error,
    );
    return false;
  } catch (error) {
    console.error('[WIDGET_BUILDER] Error creating member:', error);
    return false;
  }
}
