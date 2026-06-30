/**
 * Integration with form-builder-portal embed API.
 *
 * Session-based: asset-manager's backend authenticates with app-secret to
 * create short-lived session IDs that the iframe uses. Raw embed tokens
 * never leave the backend.
 */

const NEXT_PUBLIC_FORM_BUILDER_URL =
  process.env.NEXT_PUBLIC_FORM_BUILDER_URL || 'http://localhost:3002';
const FORM_BUILDER_APP_ID = process.env.FORM_BUILDER_APP_ID || '';
const FORM_BUILDER_APP_SECRET = process.env.FORM_BUILDER_APP_SECRET || '';
const FORM_BUILDER_EMBED_TOKEN = process.env.FORM_BUILDER_EMBED_TOKEN || '';

export interface FormBuilderSessionResponse {
  sessionId: string;
  expiresAt: string;
  userEmail: string;
  organizationId: string;
  appId: string;
}

export interface CreateFormBuilderSessionResult {
  ok: boolean;
  status: number;
  data?: FormBuilderSessionResponse;
  error?: string;
}

/**
 * Create a user in form-builder-portal under the organization bound to the
 * embed token. Uses app-secret auth (not session-based) to avoid circular
 * dependency when the user doesn't exist yet.
 */
export async function createFormBuilderMember(params: {
  email: string;
  firstName: string;
  lastName: string;
  ownerEmail: string;
  role?: 'owner' | 'admin' | 'user';
}): Promise<boolean> {
  if (!FORM_BUILDER_APP_ID || !FORM_BUILDER_APP_SECRET || !FORM_BUILDER_EMBED_TOKEN) {
    console.error(
      '[FORM_BUILDER_MEMBER] Missing FORM_BUILDER_APP_ID, FORM_BUILDER_APP_SECRET, or FORM_BUILDER_EMBED_TOKEN',
    );
    return false;
  }

  try {
    const response = await fetch(`${NEXT_PUBLIC_FORM_BUILDER_URL}/api/embed/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Id': FORM_BUILDER_APP_ID,
        'X-App-Secret': FORM_BUILDER_APP_SECRET,
        'X-Embed-Token': FORM_BUILDER_EMBED_TOKEN,
      },
      body: JSON.stringify({
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        role: params.role || 'owner',
      }),
    });

    if (response.ok || response.status === 409) {
      return true;
    }

    const data = await response.json().catch(() => ({}));
    console.error(
      '[FORM_BUILDER_MEMBER] Failed to create user:',
      response.status,
      data.error,
    );
    return false;
  } catch (error) {
    console.error('[FORM_BUILDER_MEMBER] Error:', error);
    return false;
  }
}

/**
 * Call form-builder's POST /api/embed/sessions.
 * Passes appId + appSecret (application layer), embedToken (organization layer),
 * and userEmail (user layer) to mint a session.
 */
export async function createFormBuilderSession(
  userEmail: string,
): Promise<CreateFormBuilderSessionResult> {
  if (!FORM_BUILDER_APP_ID || !FORM_BUILDER_APP_SECRET) {
    return {
      ok: false,
      status: 500,
      error:
        'Form Builder integration not configured. Set FORM_BUILDER_APP_ID and FORM_BUILDER_APP_SECRET.',
    };
  }

  try {
    const response = await fetch(`${NEXT_PUBLIC_FORM_BUILDER_URL}/api/embed/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: FORM_BUILDER_APP_ID,
        appSecret: FORM_BUILDER_APP_SECRET,
        userEmail,
        ...(FORM_BUILDER_EMBED_TOKEN ? { embedToken: FORM_BUILDER_EMBED_TOKEN } : {}),
      }),
    });

    const result = await response.json();

    if (response.ok && result.data?.sessionId) {
      return {
        ok: true,
        status: response.status,
        data: {
          sessionId: result.data.sessionId,
          expiresAt: result.data.expiresAt,
          userEmail: result.data.userEmail,
          organizationId: result.data.organizationId,
          appId: result.data.appId,
        },
      };
    }

    return {
      ok: false,
      status: response.status,
      error: result.error || 'Failed to create form-builder session',
    };
  } catch (error) {
    console.error('Error calling form-builder session API:', error);
    return {
      ok: false,
      status: 500,
      error: 'Failed to connect to form-builder',
    };
  }
}
