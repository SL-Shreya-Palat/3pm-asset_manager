/**
 * Widget Builder Session Storage Service
 *
 * Caches widget-builder session IDs per user+tenant in the asset-manager
 * database so we don't create a new session on every page refresh.
 * Mirrors form-builder-session-storage.ts.
 *
 * Document shape (collection: widgetBuilderSessions):
 * {
 *   tenantId:   ObjectId   – asset-manager tenant
 *   userId:     ObjectId   – asset-manager user
 *   sessionId:  string     – ess_xxx from widget-builder
 *   expiresAt:  Date       – expiry returned by widget-builder
 *   createdAt:  Date
 *   updatedAt:  Date
 * }
 */

import { ObjectId } from 'mongodb';
import { getWidgetBuilderSessionsCollection } from '@/lib/mongodb';

/** Minimum remaining lifetime before we treat a session as expired. */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

function toObjectId(id: string | ObjectId): ObjectId {
  return typeof id === 'string' ? ObjectId.createFromHexString(id) : id;
}

/**
 * Get a cached session that is still valid (with a 5-min safety buffer).
 * Returns the sessionId + expiresAt if found, otherwise null.
 */
export async function getCachedWidgetBuilderSession(
  tenantId: string | ObjectId,
  userId: string | ObjectId,
): Promise<{ sessionId: string; expiresAt: Date } | null> {
  try {
    const collection = await getWidgetBuilderSessionsCollection();
    const bufferThreshold = new Date(Date.now() + EXPIRY_BUFFER_MS);

    const doc = await collection.findOne({
      tenantId: toObjectId(tenantId),
      userId: toObjectId(userId),
      expiresAt: { $gt: bufferThreshold },
    });

    if (!doc) return null;

    return {
      sessionId: doc.sessionId,
      expiresAt: doc.expiresAt,
    };
  } catch (error) {
    console.error(
      '[WIDGET_BUILDER_SESSION_STORAGE] Error reading cached session:',
      error,
    );
    return null;
  }
}

/**
 * Upsert (insert-or-replace) the cached session for a user+tenant.
 * Ensures exactly one row per user+tenant.
 */
export async function upsertWidgetBuilderSession(
  tenantId: string | ObjectId,
  userId: string | ObjectId,
  sessionId: string,
  expiresAt: Date | string,
): Promise<void> {
  try {
    const collection = await getWidgetBuilderSessionsCollection();
    const now = new Date();
    const expiresAtDate =
      typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;

    await collection.updateOne(
      {
        tenantId: toObjectId(tenantId),
        userId: toObjectId(userId),
      },
      {
        $set: {
          sessionId,
          expiresAt: expiresAtDate,
          updatedAt: now,
        },
        $setOnInsert: {
          tenantId: toObjectId(tenantId),
          userId: toObjectId(userId),
          createdAt: now,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    console.error(
      '[WIDGET_BUILDER_SESSION_STORAGE] Error upserting session:',
      error,
    );
    throw error;
  }
}

/**
 * Delete the cached session for a user+tenant (e.g. on logout or revoke).
 */
export async function deleteWidgetBuilderSession(
  tenantId: string | ObjectId,
  userId: string | ObjectId,
): Promise<boolean> {
  try {
    const collection = await getWidgetBuilderSessionsCollection();
    const result = await collection.deleteOne({
      tenantId: toObjectId(tenantId),
      userId: toObjectId(userId),
    });
    return result.deletedCount > 0;
  } catch (error) {
    console.error(
      '[WIDGET_BUILDER_SESSION_STORAGE] Error deleting session:',
      error,
    );
    return false;
  }
}
