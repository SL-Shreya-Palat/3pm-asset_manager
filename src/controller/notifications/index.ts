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

export type NotificationType = 'defect_created' | 'work_order_assigned' | 'work_order_completed';

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
  await col.insertMany(docs);
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
