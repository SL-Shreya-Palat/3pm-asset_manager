/**
 * In-app notifications — lightweight, per-user, per-tenant.
 *
 * One document per (recipient, event). Writers use the `notify*` helpers;
 * the header bell reads via `listNotifications` and clears via `markRead`.
 * All notify helpers are best-effort: callers wrap them so a notification
 * failure never breaks the underlying action (defect creation, WO assignment).
 */
import { ObjectId } from 'mongodb';
import {
  getNotificationsCollection,
  getRolesCollection,
  getTenantMembersCollection,
  getTenantsCollection,
} from '@/lib/mongodb';
import { publishNotification } from '@/lib/notificationHub';

export type NotificationType =
  | 'defect_created'
  | 'fault_reported'
  | 'work_order_assigned'
  | 'work_order_completed'
  | 'work_order_created'
  | 'work_order_status_changed'
  | 'work_order_overdue'
  | 'inspection_submitted'
  | 'service_due'
  | 'service_overdue'
  | 'part_low_stock'
  | 'part_out_of_stock'
  | 'purchase_order_submitted'
  | 'purchase_order_approved'
  | 'purchase_order_rejected'
  | 'purchase_order_received';

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  /** In-app route to open when the notification is clicked. */
  link?: string;
  /** Optional source entity for traceability / future deep-linking. */
  entityType?: string;
  entityId?: string;
}

/** Insert one notification per recipient (deduped). No-op on empty recipients. */
export async function createNotifications(
  tenantOid: ObjectId,
  recipientIds: ObjectId[],
  payload: NotificationPayload,
): Promise<void> {
  const unique = [...new Map(recipientIds.map((id) => [id.toString(), id])).values()];
  if (unique.length === 0) return;

  const now = new Date();
  const docs = unique.map((recipientId) => ({
    tenantId: tenantOid,
    recipientId,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    link: payload.link ?? null,
    entityType: payload.entityType ?? null,
    entityId: payload.entityId ? new ObjectId(payload.entityId) : null,
    isRead: false,
    readAt: null,
    createdAt: now,
  }));

  const col = await getNotificationsCollection();
  const result = await col.insertMany(docs);

  // Real-time delivery: push each new notification to any live SSE connection for
  // its recipient. Best-effort — a hub failure must never break notification writes.
  try {
    const tenantId = tenantOid.toString();
    docs.forEach((doc, i) => {
      const insertedId = result.insertedIds[i];
      if (!insertedId) return;
      publishNotification(tenantId, doc.recipientId.toString(), {
        id: insertedId.toString(),
        type: doc.type,
        title: doc.title,
        body: doc.body,
        link: doc.link,
        isRead: false,
        createdAt: doc.createdAt.toISOString(),
      });
    });
  } catch (err) {
    console.error('[notifications] real-time publish failed:', err);
  }
}

/** Resolve the tenant's "managers" — active Owner/Admin members + the owner. */
async function resolveTenantManagerIds(tenantOid: ObjectId): Promise<ObjectId[]> {
  const [rolesCol, membersCol, tenantsCol] = await Promise.all([
    getRolesCollection(),
    getTenantMembersCollection(),
    getTenantsCollection(),
  ]);

  const managerRoles = await rolesCol
    .find({ tenantId: tenantOid, nameLower: { $in: ['owner', 'admin', 'manager'] } }, { projection: { _id: 1 } })
    .toArray();
  const roleIds = managerRoles.map((r) => r._id);

  const ids: ObjectId[] = [];

  if (roleIds.length > 0) {
    const members = await membersCol
      .find(
        { tenantId: tenantOid, roleId: { $in: roleIds }, isActive: true, portalUser: { $ne: false } },
        { projection: { userId: 1 } },
      )
      .toArray();
    for (const m of members) if (m.userId) ids.push(m.userId as ObjectId);
  }

  // Always include the tenant owner as a fallback (covers seed/owner edge cases).
  const tenant = await tenantsCol.findOne({ _id: tenantOid }, { projection: { ownerId: 1 } });
  if (tenant?.ownerId) ids.push(tenant.ownerId as ObjectId);

  return ids;
}

/** Notify the tenant's managers (Owner/Admin). Best-effort. */
export async function notifyTenantManagers(
  tenantId: string,
  payload: NotificationPayload,
): Promise<void> {
  try {
    const tenantOid = ObjectId.createFromHexString(tenantId);
    const recipients = await resolveTenantManagerIds(tenantOid);
    await createNotifications(tenantOid, recipients, payload);
  } catch (err) {
    console.error('[notifications] notifyTenantManagers failed:', err);
  }
}

/** Notify a single user (e.g. the mechanic assigned to a work order). Best-effort. */
export async function notifyUser(
  tenantId: string,
  userId: string | ObjectId,
  payload: NotificationPayload,
): Promise<void> {
  try {
    const tenantOid = ObjectId.createFromHexString(tenantId);
    const recipient = typeof userId === 'string' ? ObjectId.createFromHexString(userId) : userId;
    await createNotifications(tenantOid, [recipient], payload);
  } catch (err) {
    console.error('[notifications] notifyUser failed:', err);
  }
}

// ── Deduped variants (for the periodic scan — avoid re-notifying daily) ──────────
// Default window ~20h so a once-a-day scan fires at most one alert per recipient per
// (type, entity) until it's resolved.
const DEFAULT_DEDUPE_MS = 20 * 60 * 60 * 1000;

/** createNotifications, but skip recipients who already got the same (type, entityId) within windowMs. */
async function createNotificationsOnce(
  tenantOid: ObjectId,
  recipientIds: ObjectId[],
  payload: NotificationPayload,
  windowMs: number = DEFAULT_DEDUPE_MS,
): Promise<void> {
  const unique = [...new Map(recipientIds.map((id) => [id.toString(), id])).values()];
  if (unique.length === 0) return;

  const col = await getNotificationsCollection();
  const filter: Record<string, unknown> = {
    tenantId: tenantOid,
    recipientId: { $in: unique },
    type: payload.type,
    createdAt: { $gte: new Date(Date.now() - windowMs) },
  };
  if (payload.entityId) filter.entityId = new ObjectId(payload.entityId);

  const existing = await col.find(filter, { projection: { recipientId: 1 } }).toArray();
  const seen = new Set(existing.map((e) => (e.recipientId as ObjectId).toString()));
  const fresh = unique.filter((id) => !seen.has(id.toString()));
  await createNotifications(tenantOid, fresh, payload);
}

/** Deduped notify to tenant managers (for the scan). Best-effort. */
export async function notifyTenantManagersOnce(
  tenantId: string,
  payload: NotificationPayload,
  windowMs?: number,
): Promise<void> {
  try {
    const tenantOid = ObjectId.createFromHexString(tenantId);
    const recipients = await resolveTenantManagerIds(tenantOid);
    await createNotificationsOnce(tenantOid, recipients, payload, windowMs);
  } catch (err) {
    console.error('[notifications] notifyTenantManagersOnce failed:', err);
  }
}

/** Deduped notify to specific users (for the scan). Best-effort. */
export async function notifyUsersOnce(
  tenantId: string,
  userIds: (string | ObjectId)[],
  payload: NotificationPayload,
  windowMs?: number,
): Promise<void> {
  try {
    const tenantOid = ObjectId.createFromHexString(tenantId);
    const recipients = userIds.map((u) => (typeof u === 'string' ? ObjectId.createFromHexString(u) : u));
    await createNotificationsOnce(tenantOid, recipients, payload, windowMs);
  } catch (err) {
    console.error('[notifications] notifyUsersOnce failed:', err);
  }
}

function serializeNotification(doc: Record<string, unknown>) {
  return {
    id: (doc._id as ObjectId).toString(),
    type: doc.type as string,
    title: (doc.title as string) ?? '',
    body: (doc.body as string) ?? '',
    link: (doc.link as string) ?? null,
    isRead: Boolean(doc.isRead),
    createdAt: doc.createdAt ? new Date(doc.createdAt as Date).toISOString() : null,
  };
}

/** Recent notifications for the current user + unread count. */
export async function listNotifications(
  tenantId: string,
  userId: string,
  options: { limit?: number } = {},
) {
  const col = await getNotificationsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const recipientId = ObjectId.createFromHexString(userId);
  const limit = Math.min(50, Math.max(1, options.limit || 20));

  const filter = { tenantId: tenantOid, recipientId };
  const [items, unreadCount] = await Promise.all([
    col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray(),
    col.countDocuments({ ...filter, isRead: false }),
  ]);

  return {
    items: items.map((d) => serializeNotification(d as Record<string, unknown>)),
    unreadCount,
  };
}

/** Mark notifications read — specific ids, or all for the user. */
export async function markNotificationsRead(
  tenantId: string,
  userId: string,
  options: { ids?: string[]; all?: boolean },
): Promise<number> {
  const col = await getNotificationsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const recipientId = ObjectId.createFromHexString(userId);

  const filter: Record<string, unknown> = { tenantId: tenantOid, recipientId, isRead: false };
  if (!options.all) {
    const ids = (options.ids || []).filter((id) => ObjectId.isValid(id)).map((id) => ObjectId.createFromHexString(id));
    if (ids.length === 0) return 0;
    filter._id = { $in: ids };
  }

  const result = await col.updateMany(filter, { $set: { isRead: true, readAt: new Date() } });
  return result.modifiedCount;
}
