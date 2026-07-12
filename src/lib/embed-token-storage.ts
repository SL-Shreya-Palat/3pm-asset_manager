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
import {
  getEmbedTokensCollection,
  getTenantsCollection,
  getUsersCollection,
} from '@/lib/mongodb';
import { FORM_BUILDER_APP_NAME } from '@/lib/form-builder-integration';

function toObjectId(id: string | ObjectId): ObjectId {
  return typeof id === 'string' ? ObjectId.createFromHexString(id) : id;
}

/**
 * Short, stable fingerprint of an embed token. Cached form-builder sessions
 * store this so a session minted against a DIFFERENT token/org is never
 * reused — e.g. after a token rotation or re-onboarding, the old session is
 * automatically invalidated instead of failing with "Form not found or not
 * published".
 */
export function embedTokenFingerprint(token: string): string {
  let h = 0;
  for (let i = 0; i < token.length; i++) {
    h = (Math.imul(31, h) + token.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/**
 * Get the stored embed token for a tenant + app. Returns null if none.
 *
 * Strictly PER-TENANT (construction-portal pattern): every tenant onboards
 * its own form-builder organization and the token lives in the tenant's
 * embedTokens row. There is deliberately NO env-token / shared-org override —
 * per-tenant seeding populates each org's pre-start forms, and a shared org
 * would leak one tenant's forms/submissions structure to every other tenant.
 */
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
  /**
   * Email of the user the org was onboarded as — the one account guaranteed
   * to exist in the external app. Needed later to provision OTHER members
   * (an embed session can only be minted for an existing user).
   */
  ownerEmail?: string,
): Promise<void> {
  try {
    const collection = await getEmbedTokensCollection();
    const now = new Date();

    await collection.updateOne(
      { tenantId: toObjectId(tenantId), appName },
      {
        $set: {
          organizationId,
          token,
          tokenId,
          updatedAt: now,
          ...(ownerEmail ? { ownerEmail: ownerEmail.toLowerCase().trim() } : {}),
        },
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

/**
 * Resolve an email that ALREADY EXISTS as a member of the tenant's
 * form-builder organization — the account we mint the provisioning session as
 * when creating form-builder users for invited drivers/members.
 *
 * Same rule as construction-portal's member sync: act as the org onboarder /
 * tenant owner. Form-builder's embed API only creates members via a session
 * of an existing org user, so this resolution is the whole fix for
 * "User with email '<driver>' not found" — the previous code minted the
 * session for the missing driver's own email, which could never succeed.
 *
 * Resolution order:
 *   1. The tenant's embedTokens row (`ownerEmail`, recorded at onboarding —
 *      the account /api/embed/onboard created, guaranteed to exist).
 *   2. The tenant owner's login email — the owner is the account the
 *      onboarding flow runs as (construction-portal's convention).
 */
export async function getFormBuilderOwnerEmail(
  tenantId: string | ObjectId,
): Promise<string | null> {
  try {
    const collection = await getEmbedTokensCollection();
    const doc = await collection.findOne({
      tenantId: toObjectId(tenantId),
      appName: FORM_BUILDER_APP_NAME,
    });
    if (doc?.ownerEmail) return String(doc.ownerEmail);

    // Fallback: the tenant owner's login email.
    const tenants = await getTenantsCollection();
    const tenant = await tenants.findOne(
      { _id: toObjectId(tenantId) },
      { projection: { ownerId: 1 } },
    );
    if (tenant?.ownerId) {
      const users = await getUsersCollection();
      const owner = await users.findOne(
        { _id: tenant.ownerId as ObjectId },
        { projection: { email: 1 } },
      );
      if (owner?.email) return String(owner.email).toLowerCase().trim();
    }

    return null;
  } catch (error) {
    console.error('[EMBED_TOKEN_STORAGE] Error resolving FB owner email:', error);
    return null;
  }
}
