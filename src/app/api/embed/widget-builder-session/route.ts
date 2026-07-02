/**
 * POST /api/embed/widget-builder-session
 *
 * Backend broker: authenticates the logged-in user, then creates (or returns
 * a cached) session on widget-builder. Returns only the sessionId to the
 * frontend — raw embed tokens never leave the server.
 *
 * Flow (mirrors construction-portal):
 *   1. Authenticate the asset-manager user.
 *   2. Check local DB for a cached session that hasn't expired yet.
 *   3. Resolve the tenant's stored embed token.
 *   4. If no embed token -> onboard the tenant to widget-builder, store token.
 *   5. Create a new session via widget-builder API.
 *      On 404 (user unknown) -> create the member, retry once.
 *   6. Upsert the new session in local DB and return the sessionId.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getTenantsCollection } from '@/lib/mongodb';
import {
  WIDGET_BUILDER_APP_ID,
  WIDGET_BUILDER_APP_SECRET,
  WIDGET_BUILDER_APP_NAME,
  onboardToWidgetBuilder,
  createWidgetBuilderSession,
  createWidgetBuilderMember,
} from '@/lib/widget-builder-integration';
import {
  getEmbedTokenForTenant,
  storeEmbedToken,
} from '@/lib/embed-token-storage';
import {
  getCachedWidgetBuilderSession,
  upsertWidgetBuilderSession,
} from '@/lib/widget-builder-session-storage';

function splitName(name: string, email: string): { firstName: string; lastName: string } {
  const parts = (name || email).split(' ');
  return {
    firstName: parts[0] || email.split('@')[0],
    lastName: parts.slice(1).join(' ') || '-',
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.id || !user.currentTenantId || !user.email) {
      return NextResponse.json(
        { data: null, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    if (!WIDGET_BUILDER_APP_ID || !WIDGET_BUILDER_APP_SECRET) {
      return NextResponse.json(
        {
          data: null,
          error:
            'Widget Builder integration not configured. Set WIDGET_BUILDER_APP_ID and WIDGET_BUILDER_APP_SECRET in environment variables.',
        },
        { status: 500 },
      );
    }

    // ─── 1. Check for a cached, still-valid session ───
    const cachedSession = await getCachedWidgetBuilderSession(
      user.currentTenantId,
      user.id,
    );

    if (cachedSession) {
      console.log(
        `[WB_SESSION] Reusing cached session for user ${user.email} (expires ${cachedSession.expiresAt.toISOString()})`,
      );
      return NextResponse.json({
        data: {
          sessionId: cachedSession.sessionId,
          expiresAt: cachedSession.expiresAt.toISOString(),
        },
        error: null,
      });
    }

    // ─── 2. Resolve the tenant's embed token ───
    let embedToken = await getEmbedTokenForTenant(
      user.currentTenantId,
      WIDGET_BUILDER_APP_NAME,
    );

    // ─── 3. No token yet — onboard the tenant to widget-builder ───
    if (!embedToken) {
      console.log(
        `[WB_SESSION] No embed token for tenant ${user.currentTenantId}, onboarding...`,
      );

      const tenantsCollection = await getTenantsCollection();
      const tenant = await tenantsCollection.findOne({
        _id: ObjectId.createFromHexString(user.currentTenantId),
      });

      const { firstName, lastName } = splitName(user.name || '', user.email);
      const onboardResult = await onboardToWidgetBuilder({
        organizationName: tenant?.name || user.name || user.email,
        firstName,
        lastName,
        email: user.email,
      });

      if (!onboardResult) {
        return NextResponse.json(
          {
            data: null,
            error:
              'Failed to set up Widget Builder access for your organization. Please contact your administrator.',
          },
          { status: 500 },
        );
      }

      await storeEmbedToken(
        user.currentTenantId,
        onboardResult.organizationId,
        onboardResult.token,
        onboardResult.tokenId,
        WIDGET_BUILDER_APP_NAME,
      );

      embedToken = onboardResult.token;
      console.log(
        `[WB_SESSION] Onboarded and stored embed token for tenant ${user.currentTenantId}`,
      );
    }

    // ─── 4. Create a new session via widget-builder ───
    let result = await createWidgetBuilderSession(user.email, embedToken);

    // If user not found (404) — the tenant is onboarded but this specific
    // user hasn't been created in widget-builder yet. Create them and retry.
    if (!result.ok && result.status === 404) {
      console.log(
        `[WB_SESSION] User ${user.email} not found, creating in widget builder...`,
      );

      const { firstName, lastName } = splitName(user.name || '', user.email);
      const userCreated = await createWidgetBuilderMember({
        email: user.email,
        firstName,
        lastName,
        embedToken,
        role: 'user',
      });

      if (!userCreated) {
        return NextResponse.json(
          { data: null, error: 'Failed to create user in Widget Builder' },
          { status: 500 },
        );
      }

      result = await createWidgetBuilderSession(user.email, embedToken);
    }

    if (!result.ok || !result.data) {
      return NextResponse.json(
        { data: null, error: result.error || 'Failed to create Widget Builder session' },
        { status: result.status >= 400 ? result.status : 500 },
      );
    }

    // ─── 5. Cache the new session locally ───
    await upsertWidgetBuilderSession(
      user.currentTenantId,
      user.id,
      result.data.sessionId,
      result.data.expiresAt,
    );

    console.log(
      `[WB_SESSION] Created & cached new session for user ${user.email}`,
    );

    return NextResponse.json({
      data: {
        sessionId: result.data.sessionId,
        expiresAt: result.data.expiresAt,
      },
      error: null,
    });
  } catch (error) {
    console.error('[WB_SESSION] Error creating widget builder session:', error);
    return NextResponse.json(
      { data: null, error: 'Failed to create Widget Builder session' },
      { status: 500 },
    );
  }
}
