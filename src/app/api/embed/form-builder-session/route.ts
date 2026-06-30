/**
 * POST /api/embed/form-builder-session
 *
 * Backend broker: authenticates the logged-in user, then creates (or returns
 * a cached) session on the form-builder portal. Returns only the sessionId
 * to the frontend — raw embed tokens never leave the server.
 *
 * Flow:
 *   1. Authenticate the asset-manager user.
 *   2. Check local DB for a cached session that hasn't expired yet.
 *   3. If no cached session -> create a new one via form-builder API.
 *   4. Upsert the new session in local DB.
 *   5. Return the sessionId to the frontend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { createFormBuilderSession, createFormBuilderMember } from '@/lib/form-builder-integration';
import {
  getCachedFormBuilderSession,
  upsertFormBuilderSession,
} from '@/lib/form-builder-session-storage';
import { getFormBuilderOrgMappingsCollection } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId || !user.email || !user.id) {
    return NextResponse.json(
      { data: null, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  // ─── 1. Check for a cached, still-valid session ───
  const cachedSession = await getCachedFormBuilderSession(
    user.currentTenantId,
    user.id,
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

  // ─── 2. No valid session — create a new one ───
  let result = await createFormBuilderSession(user.email);

  // If user not found (404) — the tenant is onboarded but this specific user
  // hasn't been created in form-builder yet. Create them with owner role and retry.
  if (!result.ok && result.status === 404) {
    console.log(
      `[FORM_BUILDER_SESSION] User ${user.email} not found, creating in form-builder with owner role...`,
    );

    const nameParts = (user.name || user.email).split(' ');
    const firstName = nameParts[0] || user.email.split('@')[0];
    const lastName = nameParts.slice(1).join(' ') || '-';

    const userCreated = await createFormBuilderMember({
      email: user.email,
      firstName,
      lastName,
      ownerEmail: user.email,
      role: 'owner',
    });

    if (userCreated) {
      result = await createFormBuilderSession(user.email);
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

  // ─── 3. Cache the new session locally ───
  await upsertFormBuilderSession(
    user.currentTenantId,
    user.id,
    result.data.sessionId,
    result.data.expiresAt,
  );

  // ─── 4. Store org→tenant mapping for webhook form resolution ───
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
