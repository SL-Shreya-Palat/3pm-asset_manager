/**
 * Embed Token Storage Service
 *
 * Stores embed tokens per tenant + app in the asset-manager database —
 * all users in a tenant share the same token. Mirrors the construction
 * portal's embedTokens collection design (keyed by appName) so future
 * embedded apps can reuse it.
 *
 * Document shape (collection: embedTokens):
 * {
 *   tenantId:       ObjectId – asset-manager tenant
 *   organizationId: string   – org id in the external app
 *   token:          string   – emb_xxx embed token (server-side only)
 *   tokenId:        string   – token record id in the external app
 *   appName:        string   – e.g. "widget-builder"
 *   createdAt:      Date
 *   updatedAt:      Date
 * }
 */

import { ObjectId } from 'mongodb';
import { getEmbedTokensCollection } from '@/lib/mongodb';
import { FORM_BUILDER_APP_NAME } from '@/lib/form-builder-integration';

function toObjectId(id: string | ObjectId): ObjectId {
  return typeof id === 'string' ? ObjectId.createFromHexString(id) : id;
}

/**
 * Short, stable fingerprint of an embed token. Cached form-builder sessions
 * store this so a session minted against a DIFFERENT token/org is never
 * reused — e.g. when a tenant is switched to the shared org, its old
 * per-tenant session is automatically invalidated instead of failing with
 * "Form not found or not published".
 */
export function embedTokenFingerprint(token: string): string {
  let h = 0;
  for (let i = 0; i < token.length; i++) {
    h = (Math.imul(31, h) + token.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/**
 * Shared form-builder org override. When configured, EVERY tenant mints its
 * inspection session against ONE shared organization, so the seeded pre-start
 * forms are visible in every org (instead of each tenant onboarding its own
 * empty org and hitting "Form not found or not published").
 *
 * Configure either (env):
 *   FORM_BUILDER_SHARED_EMBED_TOKEN — the embed token directly, or
 *   FORM_BUILDER_SHARED_ORG_ID      — the shared org id; the token is resolved
 *                                     from the stored embedTokens row for it.
 */
async function getSharedFormBuilderToken(): Promise<string | null> {
  const direct = process.env.FORM_BUILDER_SHARED_EMBED_TOKEN;
  if (direct) return direct;

  const orgId = process.env.FORM_BUILDER_SHARED_ORG_ID;
  if (!orgId) return null;

  try {
    const collection = await getEmbedTokensCollection();
    const doc = await collection.findOne({
      organizationId: orgId,
      appName: FORM_BUILDER_APP_NAME,
    });
    return doc?.token ?? null;
  } catch (error) {
    console.error('[EMBED_TOKEN_STORAGE] Error resolving shared embed token:', error);
    return null;
  }
}

/** Get the stored embed token for a tenant + app. Returns null if none. */
export async function getEmbedTokenForTenant(
  tenantId: string | ObjectId,
  appName: string,
): Promise<string | null> {
  try {
    // Inspection form-builder: honour the shared-org override so all tenants
    // resolve to the org that holds the seeded pre-start forms.
    if (appName === FORM_BUILDER_APP_NAME) {
      const shared = await getSharedFormBuilderToken();
      if (shared) return shared;
    }

    const collection = await getEmbedTokensCollection();
    const doc = await collection.findOne({
      tenantId: toObjectId(tenantId),
      appName,
    });
    return doc?.token ?? null;
  } catch (error) {
    console.error('[EMBED_TOKEN_STORAGE] Error retrieving embed token:', error);
    return null;
  }
}

/**
 * Reverse lookup: resolve our tenantId from the external app's organizationId.
 * Used to authenticate proxied requests (e.g. Widget Builder sends
 * x-wb-organization-id on every widget data request).
 */
export async function getTenantIdFromOrganizationId(
  organizationId: string,
  appName?: string,
): Promise<ObjectId | null> {
  try {
    const collection = await getEmbedTokensCollection();
    const doc = await collection.findOne({
      organizationId,
      ...(appName ? { appName } : {}),
    });
    return doc?.tenantId ?? null;
  } catch (error) {
    console.error('[EMBED_TOKEN_STORAGE] Error resolving organizationId:', error);
    return null;
  }
}

/** Upsert the embed token for a tenant + app (one row per tenant+app). */
export async function storeEmbedToken(
  tenantId: string | ObjectId,
  organizationId: string,
  token: string,
  tokenId: string,
  appName: string,
): Promise<void> {
  try {
    const collection = await getEmbedTokensCollection();
    const now = new Date();

    await collection.updateOne(
      { tenantId: toObjectId(tenantId), appName },
      {
        $set: { organizationId, token, tokenId, updatedAt: now },
        $setOnInsert: {
          tenantId: toObjectId(tenantId),
          appName,
          createdAt: now,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    console.error('[EMBED_TOKEN_STORAGE] Error storing embed token:', error);
    throw error;
  }
}
