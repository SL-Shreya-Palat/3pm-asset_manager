/**
 * In-process pub/sub for real-time notification delivery (SSE).
 *
 * When a notification is created (controller/notifications), we publish it here;
 * the SSE endpoint (/api/notifications/stream) subscribes per (tenant, user) and
 * streams it to the connected browser instantly — no polling delay.
 *
 * NOTE: this is in-memory, so it delivers within a single Node process (standard
 * `next start`). If the app is ever run as multiple instances, cross-instance
 * delivery won't work — the bell's periodic fetch remains as a fallback, and a
 * shared bus (e.g. Redis pub/sub) would be the upgrade path.
 */
import { EventEmitter } from 'events';

export interface NotificationEvent {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string | null;
}

// Reuse a single emitter across HMR reloads / route bundles in the same process.
const globalForHub = globalThis as unknown as {
  __assetNotificationHub?: EventEmitter;
};
const hub = globalForHub.__assetNotificationHub ?? new EventEmitter();
// One listener per open browser tab — don't cap it.
hub.setMaxListeners(0);
if (!globalForHub.__assetNotificationHub) globalForHub.__assetNotificationHub = hub;

const channel = (tenantId: string, userId: string) => `n:${tenantId}:${userId}`;

/** Push a notification to any live SSE connections for this (tenant, user). */
export function publishNotification(
  tenantId: string,
  userId: string,
  event: NotificationEvent,
): void {
  hub.emit(channel(tenantId, userId), event);
}

/** Subscribe an SSE connection to a (tenant, user)'s notifications. Returns an unsubscribe fn. */
export function subscribeNotifications(
  tenantId: string,
  userId: string,
  listener: (event: NotificationEvent) => void,
): () => void {
  const ch = channel(tenantId, userId);
  hub.on(ch, listener);
  return () => {
    hub.off(ch, listener);
  };
}
