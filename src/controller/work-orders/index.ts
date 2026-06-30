import { ObjectId } from 'mongodb';
import {
  getWorkOrdersCollection,
  getWorkOrderStatusesCollection,
  getAssetsCollection,
  getVendorsCollection,
  getUsersCollection,
} from '@/lib/mongodb';
import type { CreateWorkOrderInput, UpdateWorkOrderInput } from './types';
import { validateCreateWOInput, serializeWorkOrder, generateWONumber } from './utils';

// ---------------------------------------------------------------------------
// List work orders
// ---------------------------------------------------------------------------

export async function getAllWorkOrders(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; statusId?: string },
) {
  const col = await getWorkOrdersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const filter: Record<string, unknown> = {
    tenantId: tenantOid,
    isArchived: { $ne: true },
  };

  // Status filter
  if (options.statusId) {
    try {
      filter.statusId = ObjectId.createFromHexString(options.statusId);
    } catch {
      // Invalid ObjectId, ignore filter
    }
  }

  // Search
  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    filter.$or = [{ workOrderNumber: regex }, { assetName: regex }, { assigneeName: regex }];
  }

  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => serializeWorkOrder(item as Record<string, unknown>)),
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

// ---------------------------------------------------------------------------
// Get single work order
// ---------------------------------------------------------------------------

export async function getWorkOrderById(tenantId: string, woId: string) {
  const col = await getWorkOrdersCollection();
  const doc = await col.findOne({
    _id: ObjectId.createFromHexString(woId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });
  return doc ? serializeWorkOrder(doc as Record<string, unknown>) : null;
}

// ---------------------------------------------------------------------------
// Create work order
// ---------------------------------------------------------------------------

export async function createWorkOrder(
  tenantId: string,
  userId: string,
  input: CreateWorkOrderInput,
) {
  const validation = validateCreateWOInput(input as unknown as Record<string, unknown>);
  if (!validation.valid) return { data: null, error: validation.errors };

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);
  const now = new Date();

  // Generate WO number
  const workOrderNumber = await generateWONumber(tenantOid);

  // Resolve asset name
  const assetsCol = await getAssetsCollection();
  const asset = await assetsCol.findOne({ _id: ObjectId.createFromHexString(input.assetId) });
  const assetName = (asset?.name as string) || '';

  // Resolve status label
  const statusCol = await getWorkOrderStatusesCollection();
  const status = await statusCol.findOne({ _id: ObjectId.createFromHexString(input.statusId) });
  const statusLabel = (status?.label as string) || '';

  // Resolve assignee details
  let assigneeName = '';
  let assigneeContact: string | undefined;
  let assigneeEmail: string | undefined;
  let assigneePhone: string | undefined;
  let assigneeId: ObjectId | null = null;

  if (input.assigneeType === 'vendor' && input.assigneeId) {
    assigneeId = ObjectId.createFromHexString(input.assigneeId);
    const vendorsCol = await getVendorsCollection();
    const vendor = await vendorsCol.findOne({ _id: assigneeId });
    if (vendor) {
      assigneeName = (vendor.name as string) || '';
      assigneeContact = (vendor.contactName as string) || undefined;
      assigneeEmail = (vendor.email as string) || undefined;
      assigneePhone = (vendor.phone as string) || undefined;
    }
  } else if (input.assigneeType === 'mechanic' && input.assigneeId) {
    assigneeId = ObjectId.createFromHexString(input.assigneeId);
    const usersCol = await getUsersCollection();
    const user = await usersCol.findOne({ _id: assigneeId });
    if (user) {
      assigneeName = (user.name as string) || `${(user.firstName as string) || ''} ${(user.lastName as string) || ''}`.trim();
      assigneeContact = assigneeName;
      assigneeEmail = (user.email as string) || undefined;
      assigneePhone = (user.phoneNumber as string) || undefined;
    }
  } else if (input.assigneeType === 'third_party') {
    assigneeName = input.thirdPartyName?.trim() || '';
  }

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    workOrderNumber,
    assetId: ObjectId.createFromHexString(input.assetId),
    assetName,
    serviceTaskIds: input.serviceTaskIds.map((id) => ObjectId.createFromHexString(id)),
    assigneeType: input.assigneeType,
    assigneeId,
    assigneeName,
    assigneeContact,
    assigneeEmail,
    assigneePhone,
    thirdPartyName: input.assigneeType === 'third_party' ? input.thirdPartyName?.trim() : undefined,
    thirdPartyEmail: input.assigneeType === 'third_party' ? input.thirdPartyEmail?.trim() : undefined,
    statusId: ObjectId.createFromHexString(input.statusId),
    statusLabel,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    description: input.description?.trim() || undefined,
    attachments: (input.attachments || []).map((a) => ({
      ...a,
      uploadedAt: now,
    })),
    statusHistory: [
      {
        fromStatusId: null,
        fromStatusLabel: null,
        toStatusId: ObjectId.createFromHexString(input.statusId),
        toStatusLabel: statusLabel,
        changedBy: userOid,
        changedAt: now,
      },
    ],
    createdBy: userOid,
    updatedBy: userOid,
    createdAt: now,
    updatedAt: now,
    isActive: true,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  };

  const col = await getWorkOrdersCollection();
  const result = await col.insertOne(doc);

  return {
    data: serializeWorkOrder({ ...doc, _id: result.insertedId }),
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Update work order
// ---------------------------------------------------------------------------

export async function updateWorkOrder(
  tenantId: string,
  userId: string,
  woId: string,
  input: UpdateWorkOrderInput,
) {
  const col = await getWorkOrdersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const woOid = ObjectId.createFromHexString(woId);

  const existing = await col.findOne({
    _id: woOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });

  if (!existing) return { data: null, error: 'Work order not found' };

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  // Asset
  if (input.assetId !== undefined) {
    $set.assetId = ObjectId.createFromHexString(input.assetId);
    const assetsCol = await getAssetsCollection();
    const asset = await assetsCol.findOne({ _id: ObjectId.createFromHexString(input.assetId) });
    $set.assetName = (asset?.name as string) || '';
  }

  // Service tasks
  if (input.serviceTaskIds !== undefined) {
    $set.serviceTaskIds = input.serviceTaskIds.map((id) => ObjectId.createFromHexString(id));
  }

  // Assignee
  if (input.assigneeType !== undefined) {
    $set.assigneeType = input.assigneeType;

    if (input.assigneeType === 'vendor' && input.assigneeId) {
      $set.assigneeId = ObjectId.createFromHexString(input.assigneeId);
      const vendorsCol = await getVendorsCollection();
      const vendor = await vendorsCol.findOne({ _id: ObjectId.createFromHexString(input.assigneeId) });
      if (vendor) {
        $set.assigneeName = (vendor.name as string) || '';
        $set.assigneeContact = (vendor.contactName as string) || undefined;
        $set.assigneeEmail = (vendor.email as string) || undefined;
        $set.assigneePhone = (vendor.phone as string) || undefined;
      }
      $set.thirdPartyName = undefined;
      $set.thirdPartyEmail = undefined;
    } else if (input.assigneeType === 'mechanic' && input.assigneeId) {
      $set.assigneeId = ObjectId.createFromHexString(input.assigneeId);
      const usersCol = await getUsersCollection();
      const user = await usersCol.findOne({ _id: ObjectId.createFromHexString(input.assigneeId) });
      if (user) {
        const name = (user.name as string) || `${(user.firstName as string) || ''} ${(user.lastName as string) || ''}`.trim();
        $set.assigneeName = name;
        $set.assigneeContact = name;
        $set.assigneeEmail = (user.email as string) || undefined;
        $set.assigneePhone = (user.phoneNumber as string) || undefined;
      }
      $set.thirdPartyName = undefined;
      $set.thirdPartyEmail = undefined;
    } else if (input.assigneeType === 'third_party') {
      $set.assigneeId = null;
      $set.assigneeName = input.thirdPartyName?.trim() || '';
      $set.assigneeContact = undefined;
      $set.assigneeEmail = undefined;
      $set.assigneePhone = undefined;
      $set.thirdPartyName = input.thirdPartyName?.trim();
      $set.thirdPartyEmail = input.thirdPartyEmail?.trim();
    }
  }

  // Status
  if (input.statusId !== undefined) {
    $set.statusId = ObjectId.createFromHexString(input.statusId);
    const statusCol = await getWorkOrderStatusesCollection();
    const status = await statusCol.findOne({ _id: ObjectId.createFromHexString(input.statusId) });
    $set.statusLabel = (status?.label as string) || '';
  }

  // Due date
  if (input.dueDate !== undefined) {
    $set.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  }

  // Description
  if (input.description !== undefined) {
    $set.description = input.description?.trim() || undefined;
  }

  // Attachments
  if (input.attachments !== undefined) {
    $set.attachments = input.attachments.map((a) => ({
      ...a,
      uploadedAt: new Date(),
    }));
  }

  await col.updateOne({ _id: woOid, tenantId: tenantOid }, { $set });

  const updated = await col.findOne({ _id: woOid });
  return { data: updated ? serializeWorkOrder(updated as Record<string, unknown>) : null, error: null };
}

// ---------------------------------------------------------------------------
// Delete work order (soft)
// ---------------------------------------------------------------------------

export async function deleteWorkOrder(tenantId: string, userId: string, woId: string) {
  const col = await getWorkOrdersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const woOid = ObjectId.createFromHexString(woId);

  const existing = await col.findOne({
    _id: woOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });

  if (!existing) return false;

  const result = await col.updateOne(
    { _id: woOid, tenantId: tenantOid },
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

export async function transitionWorkOrderStatus(
  tenantId: string,
  userId: string,
  woId: string,
  newStatusId: string,
) {
  const col = await getWorkOrdersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const woOid = ObjectId.createFromHexString(woId);
  const userOid = ObjectId.createFromHexString(userId);

  const existing = await col.findOne({
    _id: woOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });

  if (!existing) return { data: null, error: 'Work order not found' };

  // Validate new status exists
  const statusCol = await getWorkOrderStatusesCollection();
  const newStatus = await statusCol.findOne({
    _id: ObjectId.createFromHexString(newStatusId),
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });

  if (!newStatus) return { data: null, error: 'Invalid status' };

  const now = new Date();
  const $set: Record<string, unknown> = {
    statusId: newStatus._id,
    statusLabel: newStatus.label,
    updatedBy: userOid,
    updatedAt: now,
  };

  const historyEntry = {
    fromStatusId: existing.statusId,
    fromStatusLabel: existing.statusLabel,
    toStatusId: newStatus._id,
    toStatusLabel: newStatus.label,
    changedBy: userOid,
    changedAt: now,
  };

  await col.updateOne(
    { _id: woOid, tenantId: tenantOid },
    {
      $set,
      $push: { statusHistory: historyEntry },
    } as Record<string, unknown>,
  );

  const updated = await col.findOne({ _id: woOid });
  return { data: updated ? serializeWorkOrder(updated as Record<string, unknown>) : null, error: null };
}
