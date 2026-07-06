/**
 * Documents controller — CRUD for the `documents` collection (asset / driver /
 * team / tenant compliance "Wallet"). MongoDB native driver, no ODM.
 *
 * Status ("valid / expiring_soon / expired / no_expiry") is derived at
 * serialize time; lists are returned most-urgent first (expired → valid).
 */
import { ObjectId } from 'mongodb';
import {
  getDocumentsCollection,
  getAssetsCollection,
  getDriversCollection,
} from '@/lib/mongodb';
import { DEFAULT_REMINDER_DAYS, DOCUMENT_TYPE_LABELS, type DocumentStatus } from '@/constants/documents';
import { validateCreateDocumentInput, serializeDocument, computeDocumentStatus, daysUntil } from './utils';
import { notifyEventOnce } from '@/controller/notifications';
import type { CreateDocumentInput, UpdateDocumentInput, DocumentResponse } from './types';

/** Owner-scope filter (asset/driver/team) → the id field on the doc. */
function ownerFilter(options: {
  scope?: string;
  assetId?: string;
  driverId?: string;
  teamId?: string;
}): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (options.scope) filter.scope = options.scope;
  if (options.assetId && ObjectId.isValid(options.assetId)) {
    filter.assetId = ObjectId.createFromHexString(options.assetId);
  }
  if (options.driverId && ObjectId.isValid(options.driverId)) {
    filter.driverId = ObjectId.createFromHexString(options.driverId);
  }
  if (options.teamId && ObjectId.isValid(options.teamId)) {
    filter.teamId = ObjectId.createFromHexString(options.teamId);
  }
  return filter;
}

/** Most-urgent-first ordering for the compliance list. */
const STATUS_ORDER: Record<DocumentStatus, number> = {
  expired: 0,
  expiring_soon: 1,
  valid: 2,
  no_expiry: 3,
};

function sortByUrgency(a: DocumentResponse, b: DocumentResponse): number {
  if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
    return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  }
  // within the same status, soonest expiry first (nulls last)
  const av = a.daysUntilExpiry ?? Number.POSITIVE_INFINITY;
  const bv = b.daysUntilExpiry ?? Number.POSITIVE_INFINITY;
  return av - bv;
}

/** List documents for an owner (asset/driver/team), most-urgent first. */
export async function listDocuments(
  tenantId: string,
  options: { scope?: string; assetId?: string; driverId?: string; teamId?: string } = {},
): Promise<{ items: DocumentResponse[] }> {
  const collection = await getDocumentsCollection();
  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
    ...ownerFilter(options),
  };
  const docs = await collection.find(filter).toArray();
  const now = new Date();
  const items = docs.map((d) => serializeDocument(d as Record<string, unknown>, now)).sort(sortByUrgency);
  return { items };
}

/**
 * Documents that are expired or within their per-document reminder window — for
 * the reminder scan and (later) the Exception Report. Each doc's `reminderDays`
 * is its own "expiring soon" threshold, so the status is computed per-doc.
 */
export async function listExpiring(tenantId: string): Promise<{ items: DocumentResponse[] }> {
  const collection = await getDocumentsCollection();
  const now = new Date();
  // Max reminder lead time is 365 days, so anything expiring beyond that can't be
  // "expiring soon" yet — bound the scan to expired + next-year to skip far-future docs.
  const horizon = new Date(now.getTime() + 366 * 86_400_000);
  const docs = await collection
    .find({
      tenantId: ObjectId.createFromHexString(tenantId),
      isArchived: { $ne: true },
      expiryDate: { $ne: null, $lte: horizon },
    })
    .toArray();
  const items = docs
    .map((d) => serializeDocument(d as Record<string, unknown>, now))
    .filter((d) => d.status === 'expired' || d.status === 'expiring_soon')
    .sort(sortByUrgency);
  return { items };
}

/** Get a single document by id. */
export async function getDocumentById(tenantId: string, id: string): Promise<DocumentResponse | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = await getDocumentsCollection();
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(id),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });
  return doc ? serializeDocument(doc as Record<string, unknown>) : null;
}

/**
 * Fire an immediate bell notification to tenant managers when a document is
 * created/renewed already expired or expiring soon — so they don't wait for the
 * next daily scan. Deduped by (type, entityId), so it merges with the scan (no
 * double-fire). Best-effort: a notification failure never blocks the write.
 */
async function notifyDocumentCompliance(tenantId: string, doc: Record<string, unknown>): Promise<void> {
  try {
    const expiryDate = (doc.expiryDate as Date | null) ?? null;
    if (!expiryDate) return;
    const reminderDays = typeof doc.reminderDays === 'number' ? (doc.reminderDays as number) : DEFAULT_REMINDER_DAYS;
    const status = computeDocumentStatus(expiryDate, reminderDays);
    if (status !== 'expired' && status !== 'expiring_soon') return;

    const label = DOCUMENT_TYPE_LABELS[doc.docType as string] || (doc.title as string) || 'Document';
    const days = daysUntil(expiryDate);
    const expired = status === 'expired';
    const when = expired
      ? `expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
      : days === 0
        ? 'expires today'
        : `expires in ${days} day${days === 1 ? '' : 's'}`;

    let ownerName = 'A record';
    let link = '/assets';
    let teamIds: ObjectId[] = [];
    if (doc.scope === 'asset' && doc.assetId) {
      const assetsCol = await getAssetsCollection();
      const asset = await assetsCol.findOne(
        { _id: doc.assetId as ObjectId, tenantId: ObjectId.createFromHexString(tenantId) },
        { projection: { name: 1, teamIds: 1 } },
      );
      ownerName = (asset?.name as string) || 'An asset';
      teamIds = (asset?.teamIds as ObjectId[]) ?? [];
      link = `/assets/${(doc.assetId as ObjectId).toString()}`;
    }

    await notifyEventOnce(
      tenantId,
      {
        type: expired ? 'document_expired' : 'document_expiring',
        title: `${expired ? 'Compliance expired' : 'Compliance expiring'}: ${label}`,
        body: `${ownerName} — ${label} ${when}.`,
        link,
        entityType: 'document',
        entityId: (doc._id as ObjectId).toString(),
      },
      { teamIds },
    );
  } catch (err) {
    console.error('[documents] compliance notify failed:', err);
  }
}

/** Confirm the referenced owner exists under this tenant (asset scope in phase 1). */
async function ownerExists(tenantId: ObjectId, input: CreateDocumentInput): Promise<boolean> {
  if (input.scope === 'asset' && input.assetId) {
    const assets = await getAssetsCollection();
    return !!(await assets.findOne({ _id: ObjectId.createFromHexString(input.assetId), tenantId }));
  }
  if (input.scope === 'driver' && input.driverId) {
    const drivers = await getDriversCollection();
    return !!(await drivers.findOne({ _id: ObjectId.createFromHexString(input.driverId), tenantId }));
  }
  // team/tenant scope not gated in phase 1
  return true;
}

/** Create a document. */
export async function createDocument(
  tenantId: string,
  userId: string,
  input: CreateDocumentInput,
): Promise<{ data: DocumentResponse | null; error: unknown }> {
  const validation = validateCreateDocumentInput(input);
  if (!validation.valid) return { data: null, error: validation.errors };

  const tenantOid = ObjectId.createFromHexString(tenantId);
  if (!(await ownerExists(tenantOid, input))) {
    return { data: null, error: 'Referenced record not found' };
  }

  const collection = await getDocumentsCollection();
  const now = new Date();
  const userOid = ObjectId.createFromHexString(userId);

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    scope: input.scope,
    assetId: input.assetId ? ObjectId.createFromHexString(input.assetId) : undefined,
    driverId: input.driverId ? ObjectId.createFromHexString(input.driverId) : undefined,
    teamId: input.teamId ? ObjectId.createFromHexString(input.teamId) : undefined,
    docType: input.docType,
    title: input.title?.trim() || undefined,
    fileUrl: input.fileUrl?.trim() || undefined,
    fileName: input.fileName?.trim() || undefined,
    expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
    reminderDays: input.reminderDays != null ? Number(input.reminderDays) : DEFAULT_REMINDER_DAYS,
    notes: input.notes?.trim() || undefined,
    lastRemindedAt: null,
    createdBy: userOid,
    updatedBy: userOid,
    createdAt: now,
    updatedAt: now,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  };

  const result = await collection.insertOne(doc);
  const created = { ...doc, _id: result.insertedId };
  // Immediate bell alert if it's added already expired/expiring (else wait for scan).
  await notifyDocumentCompliance(tenantId, created);
  return { data: serializeDocument(created), error: null };
}

/** Update a document. Also powers the one-tap Renew (new expiry + optional new file). */
export async function updateDocument(
  tenantId: string,
  userId: string,
  id: string,
  input: UpdateDocumentInput,
): Promise<{ data: DocumentResponse | null; error: unknown }> {
  const collection = await getDocumentsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const docOid = ObjectId.createFromHexString(id);

  const existing = await collection.findOne({ _id: docOid, tenantId: tenantOid, isArchived: { $ne: true } });
  if (!existing) return { data: null, error: 'Document not found' };

  // Validate against the merged doc so partial updates still respect the rules.
  const merged: CreateDocumentInput = {
    scope: (input.scope ?? existing.scope) as string,
    assetId: input.assetId ?? existing.assetId?.toString(),
    driverId: input.driverId ?? existing.driverId?.toString(),
    teamId: input.teamId ?? existing.teamId?.toString(),
    docType: input.docType ?? (existing.docType as string),
    title: input.title ?? (existing.title as string | undefined),
    expiryDate:
      input.expiryDate ?? (existing.expiryDate ? (existing.expiryDate as Date).toISOString() : undefined),
    reminderDays: input.reminderDays ?? (existing.reminderDays as number),
    notes: input.notes ?? (existing.notes as string | undefined),
  };
  const validation = validateCreateDocumentInput(merged);
  if (!validation.valid) return { data: null, error: validation.errors };

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };
  if (input.docType !== undefined) $set.docType = input.docType;
  if (input.title !== undefined) $set.title = input.title?.trim() || undefined;
  if (input.fileUrl !== undefined) $set.fileUrl = input.fileUrl?.trim() || undefined;
  if (input.fileName !== undefined) $set.fileName = input.fileName?.trim() || undefined;
  if (input.expiryDate !== undefined) {
    $set.expiryDate = input.expiryDate ? new Date(input.expiryDate) : null;
    // a renewal resets reminder bookkeeping so the next window re-notifies
    $set.lastRemindedAt = null;
  }
  if (input.reminderDays !== undefined) $set.reminderDays = Number(input.reminderDays);
  if (input.notes !== undefined) $set.notes = input.notes?.trim() || undefined;

  await collection.updateOne({ _id: docOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: docOid });
  // A renewal / expiry change that lands expired or expiring gets an immediate alert.
  if (updated && input.expiryDate !== undefined) {
    await notifyDocumentCompliance(tenantId, updated as Record<string, unknown>);
  }
  return { data: updated ? serializeDocument(updated as Record<string, unknown>) : null, error: null };
}

/** Archive (soft-delete) a document. */
export async function deleteDocument(tenantId: string, userId: string, id: string): Promise<boolean> {
  const collection = await getDocumentsCollection();
  const now = new Date();
  const result = await collection.updateOne(
    {
      _id: ObjectId.createFromHexString(id),
      tenantId: ObjectId.createFromHexString(tenantId),
      isArchived: { $ne: true },
    },
    {
      $set: {
        isArchived: true,
        archivedAt: now,
        archivedBy: ObjectId.createFromHexString(userId),
        updatedBy: ObjectId.createFromHexString(userId),
        updatedAt: now,
      },
    },
  );
  return result.modifiedCount > 0;
}
