/**
 * Form Builder Session Storage Service
 *
 * Caches form-builder-portal session IDs per user+tenant in the asset-manager
 * database so we don't create a new session on every page refresh.
 *
 * Document shape (collection: formBuilderSessions):
 * {
 *   tenantId:   ObjectId   – asset-manager tenant
 *   userId:     ObjectId   – asset-manager user
 *   sessionId:  string     – ess_xxx from form-builder-portal
 *   expiresAt:  Date       – expiry returned by form-builder
 *   createdAt:  Date
 *   updatedAt:  Date
 * }
 */

import { ObjectId } from 'mongodb';
import { getFormBuilderSessionsCollection } from '@/lib/mongodb';

/** Minimum remaining lifetime before we treat a session as expired. */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get a cached session that is still valid (with a 5-min safety buffer).
 * Returns the sessionId + expiresAt if found, otherwise null.
 */
export async function getCachedFormBuilderSession(
  tenantId: string | ObjectId,
  userId: string | ObjectId,
): Promise<{ sessionId: string; expiresAt: Date } | null> {
  try {
    const collection = await getFormBuilderSessionsCollection();
    const tenantObjectId =
      typeof tenantId === 'string'
        ? ObjectId.createFromHexString(tenantId)
        : tenantId;
    const userObjectId =
      typeof userId === 'string' ? ObjectId.createFromHexString(userId) : userId;

    const bufferThreshold = new Date(Date.now() + EXPIRY_BUFFER_MS);

    const doc = await collection.findOne({
      tenantId: tenantObjectId,
      userId: userObjectId,
      expiresAt: { $gt: bufferThreshold },
    });

    if (!doc) return null;

    return {
      sessionId: doc.sessionId,
      expiresAt: doc.expiresAt,
    };
  } catch (error) {
    console.error(
      '[FORM_BUILDER_SESSION_STORAGE] Error reading cached session:',
      error,
    );
    return null;
  }
}

/**
 * Upsert (insert-or-replace) the cached session for a user+tenant.
 * Ensures exactly one row per user+tenant.
 */
export async function upsertFormBuilderSession(
  tenantId: string | ObjectId,
  userId: string | ObjectId,
  sessionId: string,
  expiresAt: Date | string,
): Promise<void> {
  try {
    const collection = await getFormBuilderSessionsCollection();
    const tenantObjectId =
      typeof tenantId === 'string'
        ? ObjectId.createFromHexString(tenantId)
        : tenantId;
    const userObjectId =
      typeof userId === 'string' ? ObjectId.createFromHexString(userId) : userId;

    const now = new Date();
    const expiresAtDate =
      typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;

    await collection.updateOne(
      {
        tenantId: tenantObjectId,
        userId: userObjectId,
      },
      {
        $set: {
          sessionId,
          expiresAt: expiresAtDate,
          updatedAt: now,
        },
        $setOnInsert: {
          tenantId: tenantObjectId,
          userId: userObjectId,
          createdAt: now,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    console.error(
      '[FORM_BUILDER_SESSION_STORAGE] Error upserting session:',
      error,
    );
    throw error;
  }
}

/**
 * Delete the cached session for a user+tenant (e.g. on logout or revoke).
 */
export async function deleteFormBuilderSession(
  tenantId: string | ObjectId,
  userId: string | ObjectId,
): Promise<boolean> {
  try {
    const collection = await getFormBuilderSessionsCollection();
    const tenantObjectId =
      typeof tenantId === 'string'
        ? ObjectId.createFromHexString(tenantId)
        : tenantId;
    const userObjectId =
      typeof userId === 'string' ? ObjectId.createFromHexString(userId) : userId;

    const result = await collection.deleteOne({
      tenantId: tenantObjectId,
      userId: userObjectId,
    });
    return result.deletedCount > 0;
  } catch (error) {
    console.error(
      '[FORM_BUILDER_SESSION_STORAGE] Error deleting session:',
      error,
    );
    return false;
  }
}
