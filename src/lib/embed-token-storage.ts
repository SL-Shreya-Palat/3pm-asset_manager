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

function toObjectId(id: string | ObjectId): ObjectId {
  return typeof id === 'string' ? ObjectId.createFromHexString(id) : id;
}

/** Get the stored embed token for a tenant + app. Returns null if none. */
export async function getEmbedTokenForTenant(
  tenantId: string | ObjectId,
  appName: string,
): Promise<string | null> {
  try {
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
