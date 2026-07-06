import { ObjectId } from 'mongodb';
import {
  getPurchaseOrdersCollection,
  getCountersCollection,
  getVendorsCollection,
  getTenantMembersCollection,
} from '@/lib/mongodb';
import type { CreatePurchaseOrderInput, UpdatePurchaseOrderInput, TaxType, POStatus } from './types';
import {
  validateCreatePOInput,
  calculateCostSummary,
  serializePurchaseOrder,
  VALID_TRANSITIONS,
  isValidStatusForName,
} from './utils';
import { creditPartsStock } from '@/controller/parts/stock';
import { getUserRoleForTenant } from '@/lib/auth-helper';
import { notifyUser, notifyTenantManagers } from '@/controller/notifications';

const PO_LINK = '/maintenance/purchase-orders';

/** Resolve a tenantMember `_id` (the id the approver picker uses) → the user's `userId`
 *  (the id notifications are addressed to). Returns null if unresolved. */
async function resolveMemberUserId(tenantOid: ObjectId, memberId: ObjectId): Promise<ObjectId | null> {
  const membersCol = await getTenantMembersCollection();
  const member = await membersCol.findOne({ _id: memberId, tenantId: tenantOid }, { projection: { userId: 1 } });
  return member?.userId ? (member.userId as ObjectId) : null;
}

/** Notify a PO's approver that it's awaiting their decision (best-effort). */
async function notifyApproverSubmitted(
  tenantId: string,
  tenantOid: ObjectId,
  po: Record<string, unknown>,
): Promise<void> {
  if (!po.approverId) return;
  const approverUserId = await resolveMemberUserId(tenantOid, po.approverId as ObjectId);
  if (!approverUserId) return;
  const poNumber = (po.poNumber as string) || 'Purchase order';
  await notifyUser(tenantId, approverUserId, {
    type: 'purchase_order_submitted',
    title: `${poNumber} awaiting your approval`,
    body: `${(po.vendorName as string) || 'Vendor'} — total $${Number(po.total ?? 0).toFixed(2)}. Submitted for your approval.`,
    link: PO_LINK,
    entityType: 'purchaseOrder',
  });
}

// ---------------------------------------------------------------------------
// PO number generation
// ---------------------------------------------------------------------------

async function generatePONumber(tenantId: ObjectId): Promise<string> {
  const counters = await getCountersCollection();
  const result = await counters.findOneAndUpdate(
    { _id: `po_${tenantId.toString()}` as unknown as ObjectId, tenantId },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  const seq = (result?.seq as number) || 1;
  return `PO-${String(seq).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// List purchase orders
// ---------------------------------------------------------------------------

export async function getAllPurchaseOrders(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; status?: string; showArchived?: boolean },
) {
  const col = await getPurchaseOrdersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const filter: Record<string, unknown> = {
    tenantId: tenantOid,
  };

  if (options.showArchived) {
    filter.isArchived = true;
  } else {
    filter.isArchived = { $ne: true };
  }

  // Status filter
  if (options.status && options.status !== 'all' && isValidStatusForName(options.status)) {
    filter.status = options.status;
  }

  // Search
  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    filter.$or = [{ poNumber: regex }, { vendorName: regex }, { description: regex }];
  }

  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => serializePurchaseOrder(item as Record<string, unknown>)),
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

// ---------------------------------------------------------------------------
// Get single PO
// ---------------------------------------------------------------------------

export async function getPurchaseOrderById(tenantId: string, poId: string) {
  const col = await getPurchaseOrdersCollection();
  const doc = await col.findOne({
    _id: ObjectId.createFromHexString(poId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });
  return doc ? serializePurchaseOrder(doc as Record<string, unknown>) : null;
}

// ---------------------------------------------------------------------------
// Create PO
// ---------------------------------------------------------------------------

export async function createPurchaseOrder(
  tenantId: string,
  userId: string,
  input: CreatePurchaseOrderInput,
) {
  const validation = validateCreatePOInput(input as unknown as Record<string, unknown>);
  if (!validation.valid) return { data: null, error: validation.errors };

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);
  const now = new Date();

  // Generate PO number
  const poNumber = await generatePONumber(tenantOid);

  // Resolve vendor name
  const vendorsCol = await getVendorsCollection();
  const vendor = await vendorsCol.findOne({ _id: ObjectId.createFromHexString(input.vendorId) });
  const vendorName = (vendor?.name as string) || '';

  // Compute costs
  const taxType: TaxType = (input.taxType as TaxType) || 'fixed';
  const taxValue = input.taxValue || 0;
  const shipping = input.shipping || 0;
  const lineItemsData = input.lineItems.map((li) => ({
    partId: ObjectId.createFromHexString(li.partId),
    quantity: li.quantity,
    unitCost: li.unitCost,
    total: Math.round(li.quantity * li.unitCost * 100) / 100,
    receivedQuantity: 0,
  }));
  const { subTotal, total } = calculateCostSummary(input.lineItems, shipping, taxType, taxValue);

  const initialStatus: POStatus = input.status === 'pending_approval' ? 'pending_approval' : 'draft';

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    poNumber,
    status: initialStatus,
    vendorId: ObjectId.createFromHexString(input.vendorId),
    vendorName,
    deliveryLocationId: ObjectId.createFromHexString(input.deliveryLocationId),
    approverId: ObjectId.createFromHexString(input.approverId),
    lineItems: lineItemsData,
    subTotal,
    shipping,
    taxType,
    taxValue,
    total,
    description: input.description?.trim() || undefined,
    documents: (input.documents || []).map((d) => ({
      ...d,
      uploadedAt: now,
    })),
    statusHistory: [
      { from: null, to: initialStatus, changedBy: userOid, changedAt: now },
    ],
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionReason: undefined,
    createdBy: userOid,
    updatedBy: userOid,
    createdAt: now,
    updatedAt: now,
    isActive: true,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  };

  const col = await getPurchaseOrdersCollection();
  const result = await col.insertOne(doc);

  // If it goes straight to pending approval, alert the approver.
  if (initialStatus === 'pending_approval') {
    await notifyApproverSubmitted(tenantId, tenantOid, doc);
  }

  return {
    data: serializePurchaseOrder({ ...doc, _id: result.insertedId }),
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Update PO (only draft/rejected)
// ---------------------------------------------------------------------------

export async function updatePurchaseOrder(
  tenantId: string,
  userId: string,
  poId: string,
  input: UpdatePurchaseOrderInput,
) {
  const col = await getPurchaseOrdersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const poOid = ObjectId.createFromHexString(poId);

  const existing = await col.findOne({
    _id: poOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });

  if (!existing) return { data: null, error: 'Purchase order not found' };

  if (!['draft', 'rejected'].includes(existing.status as string)) {
    return { data: null, error: 'Purchase order can only be edited in Draft or Rejected status' };
  }

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  if (input.vendorId !== undefined) {
    $set.vendorId = ObjectId.createFromHexString(input.vendorId);
    const vendorsCol = await getVendorsCollection();
    const vendor = await vendorsCol.findOne({ _id: ObjectId.createFromHexString(input.vendorId) });
    $set.vendorName = (vendor?.name as string) || '';
  }

  if (input.deliveryLocationId !== undefined) {
    $set.deliveryLocationId = ObjectId.createFromHexString(input.deliveryLocationId);
  }

  if (input.approverId !== undefined) {
    $set.approverId = ObjectId.createFromHexString(input.approverId);
  }

  if (input.lineItems !== undefined) {
    // Editing is only allowed in draft/rejected (nothing received yet), so reset received to 0.
    $set.lineItems = input.lineItems.map((li) => ({
      partId: ObjectId.createFromHexString(li.partId),
      quantity: li.quantity,
      unitCost: li.unitCost,
      total: Math.round(li.quantity * li.unitCost * 100) / 100,
      receivedQuantity: 0,
    }));
  }

  if (input.shipping !== undefined) $set.shipping = input.shipping;
  if (input.taxType !== undefined) $set.taxType = input.taxType;
  if (input.taxValue !== undefined) $set.taxValue = input.taxValue;
  if (input.description !== undefined) $set.description = input.description?.trim() || undefined;

  if (input.documents !== undefined) {
    $set.documents = input.documents.map((d) => ({
      ...d,
      uploadedAt: new Date(),
    }));
  }

  // Recalculate costs
  const lineItems = input.lineItems || (existing.lineItems as Array<{ quantity: number; unitCost: number }>);
  const shipping = input.shipping ?? (existing.shipping as number);
  const taxType = (input.taxType ?? existing.taxType) as TaxType;
  const taxValue = input.taxValue ?? (existing.taxValue as number);
  const { subTotal, total } = calculateCostSummary(lineItems, shipping, taxType, taxValue);
  $set.subTotal = subTotal;
  $set.total = total;

  await col.updateOne({ _id: poOid, tenantId: tenantOid }, { $set });

  const updated = await col.findOne({ _id: poOid });
  return { data: updated ? serializePurchaseOrder(updated as Record<string, unknown>) : null, error: null };
}

// ---------------------------------------------------------------------------
// Delete PO
// ---------------------------------------------------------------------------

/** Permanently delete a purchase order. */
export async function deletePurchaseOrder(tenantId: string, userId: string, poId: string) {
  const col = await getPurchaseOrdersCollection();
  const docOid = ObjectId.createFromHexString(poId);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const result = await col.deleteOne({ _id: docOid, tenantId: tenantOid });
  return result.deletedCount > 0;
}

// ---------------------------------------------------------------------------
// Status transition
// ---------------------------------------------------------------------------

export async function transitionPurchaseOrderStatus(
  tenantId: string,
  userId: string,
  poId: string,
  newStatus: string,
  note?: string,
) {
  if (!isValidStatusForName(newStatus)) {
    return { data: null, error: 'Invalid status' };
  }

  const col = await getPurchaseOrdersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const poOid = ObjectId.createFromHexString(poId);
  const userOid = ObjectId.createFromHexString(userId);

  const existing = await col.findOne({
    _id: poOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });

  if (!existing) return { data: null, error: 'Purchase order not found' };

  const currentStatus = existing.status as POStatus;
  const allowed = VALID_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(newStatus as POStatus)) {
    return {
      data: null,
      error: `Cannot transition from "${currentStatus}" to "${newStatus}"`,
    };
  }

  // Receiving credits stock per-line — it must go through receivePurchaseOrder, not
  // a plain status change (which would move the status without touching inventory).
  if (newStatus === 'received' || newStatus === 'received_partial') {
    return { data: null, error: 'Use the Receive action to receive items into stock' };
  }

  // Approval gate: only the named approver or a full-access role (owner/admin/manager)
  // can approve/reject, and the creator can't approve their own PO unless full-access.
  if (newStatus === 'approved' || newStatus === 'rejected') {
    const role = await getUserRoleForTenant(userId, tenantId);
    const isFullAccess = !!role?.fullAccess;
    const approverUserId = existing.approverId
      ? await resolveMemberUserId(tenantOid, existing.approverId as ObjectId)
      : null;
    const isNamedApprover = approverUserId?.toString() === userOid.toString();

    if (!isFullAccess && !isNamedApprover) {
      return { data: null, error: 'Only the assigned approver or a manager can approve or reject this purchase order' };
    }
    const isCreator = existing.createdBy?.toString() === userOid.toString();
    if (isCreator && !isFullAccess) {
      return { data: null, error: 'You cannot approve a purchase order you created' };
    }
  }

  // Rejection requires a note
  if (newStatus === 'rejected' && !note?.trim()) {
    return { data: null, error: 'Rejection reason is required' };
  }

  const now = new Date();
  const $set: Record<string, unknown> = {
    status: newStatus,
    updatedBy: userOid,
    updatedAt: now,
  };

  if (newStatus === 'approved') {
    $set.approvedAt = now;
    $set.approvedBy = userOid;
  }

  if (newStatus === 'rejected') {
    $set.rejectedAt = now;
    $set.rejectedBy = userOid;
    $set.rejectionReason = note?.trim();
  }

  const historyEntry = {
    from: currentStatus,
    to: newStatus,
    changedBy: userOid,
    changedAt: now,
    note: note?.trim() || undefined,
  };

  await col.updateOne(
    { _id: poOid, tenantId: tenantOid },
    {
      $set,
      $push: { statusHistory: historyEntry },
    } as Record<string, unknown>,
  );

  // Outcome notifications (best-effort).
  const poNumber = (existing.poNumber as string) || 'Purchase order';
  const vendorName = (existing.vendorName as string) || 'the vendor';
  if (newStatus === 'pending_approval') {
    await notifyApproverSubmitted(tenantId, tenantOid, existing);
  } else if (newStatus === 'approved' && existing.createdBy) {
    await notifyUser(tenantId, existing.createdBy as ObjectId, {
      type: 'purchase_order_approved',
      title: `${poNumber} approved`,
      body: `Your purchase order to ${vendorName} ($${Number(existing.total ?? 0).toFixed(2)}) was approved.`,
      link: PO_LINK,
      entityType: 'purchaseOrder',
      entityId: poOid.toString(),
    });
  } else if (newStatus === 'rejected' && existing.createdBy) {
    await notifyUser(tenantId, existing.createdBy as ObjectId, {
      type: 'purchase_order_rejected',
      title: `${poNumber} rejected`,
      body: `Your purchase order to ${vendorName} was rejected${note?.trim() ? `: ${note.trim()}` : '.'}`,
      link: PO_LINK,
      entityType: 'purchaseOrder',
      entityId: poOid.toString(),
    });
  }

  const updated = await col.findOne({ _id: poOid });
  return { data: updated ? serializePurchaseOrder(updated as Record<string, unknown>) : null, error: null };
}

// ---------------------------------------------------------------------------
// Receive items into stock (per-line, delta-credited)
// ---------------------------------------------------------------------------

interface POLineReceipt {
  /** Index of the line item in the PO's lineItems array. */
  index: number;
  /** Units received now (clamped to what's still outstanding). */
  quantity: number;
}

/**
 * Receive some or all outstanding quantities of a purchased PO into stock.
 * Credits ONLY the newly-received delta to the delivery location, bumps each
 * line's receivedQuantity, and sets the PO to `received` (all lines complete)
 * or `received_partial` (some still outstanding). Callable repeatedly until the
 * PO is fully received.
 */
export async function receivePurchaseOrder(
  tenantId: string,
  userId: string,
  poId: string,
  receipts: POLineReceipt[],
) {
  const col = await getPurchaseOrdersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const poOid = ObjectId.createFromHexString(poId);
  const userOid = ObjectId.createFromHexString(userId);

  const existing = await col.findOne({ _id: poOid, tenantId: tenantOid, isArchived: { $ne: true } });
  if (!existing) return { data: null, error: 'Purchase order not found' };

  const status = existing.status as POStatus;
  if (status !== 'purchased' && status !== 'received_partial') {
    return { data: null, error: 'Only purchased or partially received purchase orders can be received' };
  }

  const lineItems = (existing.lineItems as Array<{
    partId: ObjectId; quantity: number; unitCost: number; total: number; receivedQuantity?: number;
  }>) || [];

  // Requested units per line index (positive integers only).
  const reqByIndex = new Map<number, number>();
  for (const r of receipts || []) {
    const idx = Number(r?.index);
    const qty = Math.floor(Number(r?.quantity));
    if (!Number.isInteger(idx) || idx < 0 || idx >= lineItems.length) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    reqByIndex.set(idx, qty);
  }
  if (reqByIndex.size === 0) return { data: null, error: 'Enter at least one quantity to receive' };

  // Compute the per-line delta (clamped to outstanding) and build stock credits.
  const credits: Array<{ partId: ObjectId; quantity: number }> = [];
  const updatedLines = lineItems.map((li, idx) => {
    const already = li.receivedQuantity ?? 0;
    const outstanding = Math.max(0, li.quantity - already);
    const take = Math.min(Math.max(0, reqByIndex.get(idx) ?? 0), outstanding);
    if (take > 0) credits.push({ partId: li.partId, quantity: take });
    return { ...li, receivedQuantity: already + take };
  });

  if (credits.length === 0) {
    return { data: null, error: 'Nothing left to receive for the selected items' };
  }

  // Credit the delta into inventory at the delivery location.
  await creditPartsStock(tenantOid, credits, existing.deliveryLocationId as ObjectId, userOid);

  const fullyReceived = updatedLines.every((li) => (li.receivedQuantity ?? 0) >= li.quantity);
  const newStatus: POStatus = fullyReceived ? 'received' : 'received_partial';

  const now = new Date();
  const $set: Record<string, unknown> = {
    lineItems: updatedLines,
    status: newStatus,
    updatedBy: userOid,
    updatedAt: now,
  };
  if (!existing.stockReceivedAt) $set.stockReceivedAt = now;

  const historyEntry = {
    from: status,
    to: newStatus,
    changedBy: userOid,
    changedAt: now,
    note: `Received ${credits.reduce((s, c) => s + c.quantity, 0)} item(s) into stock`,
  };

  await col.updateOne(
    { _id: poOid, tenantId: tenantOid },
    { $set, $push: { statusHistory: historyEntry } } as Record<string, unknown>,
  );

  // Let managers know stock arrived (best-effort).
  await notifyTenantManagers(tenantId, {
    type: 'purchase_order_received',
    title: `${(existing.poNumber as string) || 'Purchase order'} — items received`,
    body: `${(existing.vendorName as string) || 'Vendor'} — ${newStatus === 'received' ? 'fully received' : 'partially received'} into stock.`,
    link: PO_LINK,
    entityType: 'purchaseOrder',
    entityId: poOid.toString(),
  });

  const updated = await col.findOne({ _id: poOid });
  return { data: updated ? serializePurchaseOrder(updated as Record<string, unknown>) : null, error: null };
}
