import { ObjectId } from 'mongodb';
import { getPurchaseOrdersCollection, getCountersCollection, getVendorsCollection } from '@/lib/mongodb';
import type { CreatePurchaseOrderInput, UpdatePurchaseOrderInput, TaxType, POStatus } from './types';
import {
  validateCreatePOInput,
  calculateCostSummary,
  serializePurchaseOrder,
  VALID_TRANSITIONS,
  isValidStatusForName,
} from './utils';

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
  options: { page?: number; limit?: number; search?: string; status?: string },
) {
  const col = await getPurchaseOrdersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const filter: Record<string, unknown> = {
    tenantId: tenantOid,
    isArchived: { $ne: true },
  };

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
    $set.lineItems = input.lineItems.map((li) => ({
      partId: ObjectId.createFromHexString(li.partId),
      quantity: li.quantity,
      unitCost: li.unitCost,
      total: Math.round(li.quantity * li.unitCost * 100) / 100,
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
// Delete PO (soft, draft only)
// ---------------------------------------------------------------------------

export async function deletePurchaseOrder(tenantId: string, userId: string, poId: string) {
  const col = await getPurchaseOrdersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const poOid = ObjectId.createFromHexString(poId);

  const existing = await col.findOne({
    _id: poOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });

  if (!existing) return false;
  if (existing.status !== 'draft') return false;

  const result = await col.updateOne(
    { _id: poOid, tenantId: tenantOid },
    {
      $set: {
        isArchived: true,
        archivedAt: new Date(),
        archivedBy: ObjectId.createFromHexString(userId),
        updatedBy: ObjectId.createFromHexString(userId),
        updatedAt: new Date(),
      },
    },
  );

  return result.modifiedCount > 0;
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

  const updated = await col.findOne({ _id: poOid });
  return { data: updated ? serializePurchaseOrder(updated as Record<string, unknown>) : null, error: null };
}
