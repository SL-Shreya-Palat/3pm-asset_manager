/**
 * POST /api/embed/form-builder-session
 *
 * Backend broker: authenticates the logged-in user, then creates (or returns
 * a cached) session on the form-builder portal. Returns only the sessionId
 * to the frontend — raw embed tokens never leave the server.
 *
 * Flow (matching construction-portal):
 *   1. Authenticate the asset-manager user.
 *   2. Check local DB for a cached session that hasn't expired yet.
 *   3. Resolve the tenant's stored embed token.
 *   4. If no embed token -> onboard the tenant first -> store the token.
 *   5. Create a new session via form-builder's POST /api/embed/sessions.
 *   6. On 404 (tenant exists but user isn't a member yet) -> create the user
 *      via POST /api/embed/users (session-based) -> retry session creation.
 *   7. Upsert the new session in local DB.
 *   8. Return the sessionId to the frontend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getTenantsCollection } from '@/lib/mongodb';
import {
  FORM_BUILDER_APP_NAME,
  createFormBuilderSession,
  createFormBuilderMember,
  onboardFormBuilderTenant,
} from '@/lib/form-builder-integration';
import {
  getEmbedTokenForTenant,
  getFormBuilderOwnerEmail,
  storeEmbedToken,
  embedTokenFingerprint,
} from '@/lib/embed-token-storage';
import {
  getCachedFormBuilderSession,
  upsertFormBuilderSession,
} from '@/lib/form-builder-session-storage';
import { getFormBuilderOrgMappingsCollection } from '@/lib/mongodb';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId || !user.email || !user.id) {
    return NextResponse.json(
      { data: null, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  // ─── 1. Resolve the embed token FIRST (the shared-org override applies
  //        here, so all tenants can be pinned to one organization). ───
  let embedToken = await getEmbedTokenForTenant(
    user.currentTenantId,
    FORM_BUILDER_APP_NAME,
  );

  // ─── 2. If no embed token exists, onboard the tenant first (owner flow) ───
  if (!embedToken) {
    console.log(
      `[FORM_BUILDER_SESSION] No embed token for tenant ${user.currentTenantId}, onboarding...`,
    );

    const tenantsCollection = await getTenantsCollection();
    const tenant = await tenantsCollection.findOne({
      _id: ObjectId.createFromHexString(user.currentTenantId),
    });

    const organizationName =
      tenant?.name?.toString?.() ||
      user.name ||
      user.email.split('@')[0] ||
      'My Organization';

    const nameParts = (user.name || user.email).split(' ');
    const firstName = nameParts[0] || user.email.split('@')[0];
    const lastName = nameParts.slice(1).join(' ') || '-';

    const onboardResult = await onboardFormBuilderTenant({
      email: user.email,
      firstName,
      lastName,
      organizationName,
    });

    if (!onboardResult) {
      return NextResponse.json(
        {
          data: null,
          error:
            'Failed to set up form builder access for your organization. Please contact your administrator.',
        },
        { status: 500 },
      );
    }

    await storeEmbedToken(
      user.currentTenantId,
      onboardResult.organizationId,
      onboardResult.token,
      onboardResult.tokenId,
      FORM_BUILDER_APP_NAME,
      // The onboarder is the one account guaranteed to exist in the new org —
      // recorded so future members (invited drivers) can be provisioned.
      user.email,
    );

    embedToken = onboardResult.token;
    console.log(
      `[FORM_BUILDER_SESSION] Onboarded and stored embed token for tenant ${user.currentTenantId}`,
    );
  }

  const tokenFp = embedTokenFingerprint(embedToken);

  // ─── 3. Reuse a cached session ONLY if it was minted against this same
  //        token/org. A fingerprint mismatch (e.g. after switching to the
  //        shared org) means the old session can't see the forms — re-mint. ───
  const cachedSession = await getCachedFormBuilderSession(
    user.currentTenantId,
    user.id,
    tokenFp,
  );

  if (cachedSession) {
    console.log(
      `[FORM_BUILDER_SESSION] Reusing cached session for user ${user.email} (expires ${cachedSession.expiresAt.toISOString()})`,
    );
    return NextResponse.json({
      data: {
        sessionId: cachedSession.sessionId,
        expiresAt: cachedSession.expiresAt.toISOString(),
      },
      error: null,
    });
  }

  // ─── 4. Create a new session via form-builder ───
  let result = await createFormBuilderSession({
    userEmail: user.email,
    embedToken,
  });

  // If user not found (404) — the tenant is onboarded but this specific user
  // (e.g. an invited driver) hasn't been created in form-builder yet. Create
  // them via a session minted for an EXISTING org account (the onboarder /
  // owner) and retry. Minting the session for the missing user's own email
  // can never succeed — that was the old bug.
  if (!result.ok && result.status === 404) {
    const ownerEmail = await getFormBuilderOwnerEmail(user.currentTenantId);

    if (!ownerEmail || ownerEmail === user.email.toLowerCase().trim()) {
      console.error(
        `[FORM_BUILDER_SESSION] Can't provision ${user.email}: no usable owner ` +
          'email for this tenant (no embedTokens.ownerEmail and no resolvable tenant owner).',
      );
      return NextResponse.json(
        {
          data: null,
          error:
            'Your inspection account has not been set up yet and automatic setup is not configured. Please contact your administrator.',
        },
        { status: 503 },
      );
    }

    console.log(
      `[FORM_BUILDER_SESSION] User ${user.email} not found, creating in form-builder as ${ownerEmail}...`,
    );

    const nameParts = (user.name || user.email).split(' ');
    const firstName = nameParts[0] || user.email.split('@')[0];
    const lastName = nameParts.slice(1).join(' ') || '-';

    const userCreated = await createFormBuilderMember({
      email: user.email,
      firstName,
      lastName,
      ownerEmail,
      embedToken,
      role: 'user',
    });

    if (userCreated) {
      result = await createFormBuilderSession({
        userEmail: user.email,
        embedToken,
      });
      console.log(
        `[FORM_BUILDER_SESSION] Created user & retried session for ${user.email}`,
      );
    }
  }

  if (!result.ok || !result.data) {
    return NextResponse.json(
      { data: null, error: result.error || 'Failed to create form-builder session' },
      { status: result.status >= 400 ? result.status : 500 },
    );
  }

  // ─── 5. Cache the new session locally (tagged with the token fingerprint) ───
  await upsertFormBuilderSession(
    user.currentTenantId,
    user.id,
    result.data.sessionId,
    result.data.expiresAt,
    tokenFp,
  );

  // ─── 6. Store org→tenant mapping for webhook form resolution ───
  if (result.data.organizationId && user.currentTenantId) {
    try {
      const orgMappingsCollection = await getFormBuilderOrgMappingsCollection();
      await orgMappingsCollection.updateOne(
        { organizationId: result.data.organizationId },
        {
          $set: {
            tenantId: ObjectId.createFromHexString(user.currentTenantId),
            updatedAt: new Date(),
          },
          $setOnInsert: {
            organizationId: result.data.organizationId,
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );
    } catch (mappingError) {
      console.error(
        '[FORM_BUILDER_SESSION] Failed to upsert org→tenant mapping:',
        mappingError,
      );
    }
  }

  console.log(
    `[FORM_BUILDER_SESSION] Created & cached new session for user ${user.email}`,
  );

  return NextResponse.json({
    data: {
      sessionId: result.data.sessionId,
      expiresAt: result.data.expiresAt,
    },
    error: null,
  });
}
