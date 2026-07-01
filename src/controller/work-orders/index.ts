import { ObjectId } from 'mongodb';
import {
  getWorkOrdersCollection,
  getWorkOrderStatusesCollection,
  getAssetsCollection,
  getVendorsCollection,
  getTenantMembersCollection,
  getDefectsCollection,
} from '@/lib/mongodb';
import type { CreateWorkOrderInput, UpdateWorkOrderInput, WOPart } from './types';
import { validateCreateWOInput, serializeWorkOrder, generateWONumber } from './utils';
import { resolveWorkOrderParts, applyInventoryDelta } from './parts-inventory';
import { notifyUser, notifyTenantManagers } from '@/controller/notifications';
import { logServiceEntry } from '@/controller/service-history';

// ---------------------------------------------------------------------------
// List work orders
// ---------------------------------------------------------------------------

export async function getAllWorkOrders(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; statusId?: string; assigneeId?: string },
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

  // Assignee filter (e.g. a mechanic's "My Work Orders")
  if (options.assigneeId) {
    try {
      filter.assigneeId = ObjectId.createFromHexString(options.assigneeId);
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
    // Mechanics come from the tenant members list (/api/users), so resolve the
    // name from tenantMembers — NOT the users collection (different id space).
    const membersCol = await getTenantMembersCollection();
    const member = await membersCol.findOne({ _id: assigneeId, tenantId: tenantOid });
    if (member) {
      assigneeName = (member.name as string)
        || `${(member.firstName as string) || ''} ${(member.lastName as string) || ''}`.trim();
      assigneeContact = assigneeName;
      assigneeEmail = (member.email as string) || undefined;
      assigneePhone = (member.phoneNumber as string) || undefined;
    }
  } else if (input.assigneeType === 'third_party') {
    assigneeName = input.thirdPartyName?.trim() || '';
  }

  // Source + linked defects (a defect-raised WO corrects one or more defects).
  const source = input.source === 'defect' ? 'defect' : 'manual';
  const defectOids = (Array.isArray(input.defectIds) ? input.defectIds : [])
    .filter((id) => ObjectId.isValid(id))
    .map((id) => ObjectId.createFromHexString(id));

  // Parts → denormalized lines + total (stock deducted after insert).
  const { parts, partsCost } = await resolveWorkOrderParts(tenantOid, input.parts);

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    workOrderNumber,
    assetId: ObjectId.createFromHexString(input.assetId),
    assetName,
    serviceTaskIds: (input.serviceTaskIds || []).map((id) => ObjectId.createFromHexString(id)),
    source,
    defectIds: defectOids,
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
    parts,
    partsCost,
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

  // Deduct the parts used from inventory ([] → parts).
  if (parts.length > 0) {
    await applyInventoryDelta(tenantOid, [], parts, userOid);
  }

  // Link defects → mark in_progress + back-reference this WO.
  if (defectOids.length > 0) {
    const defectsCol = await getDefectsCollection();
    await defectsCol.updateMany(
      { _id: { $in: defectOids }, tenantId: tenantOid, isArchived: { $ne: true } },
      {
        $set: {
          status: 'in_progress',
          workOrderId: result.insertedId,
          workOrderNumber,
          updatedBy: userOid,
          updatedAt: now,
        },
      },
    );
  }

  // Notify the assigned mechanic (best-effort).
  if (input.assigneeType === 'mechanic' && assigneeId) {
    await notifyUser(tenantId, assigneeId, {
      type: 'work_order_assigned',
      title: `Work order ${workOrderNumber} assigned to you`,
      body: `${assetName || 'Asset'} — ${statusLabel || 'New'}${input.dueDate ? `, due ${new Date(input.dueDate).toLocaleDateString()}` : ''}`,
      link: '/maintenance/work-orders',
      entityType: 'workOrder',
      entityId: result.insertedId.toString(),
    });
  }

  // Notify managers that a new work order was created (best-effort).
  await notifyTenantManagers(tenantId, {
    type: 'work_order_created',
    title: `Work order ${workOrderNumber} created`,
    body: `${assetName || 'Asset'}${statusLabel ? ` — ${statusLabel}` : ''}${input.dueDate ? `, due ${new Date(input.dueDate).toLocaleDateString()}` : ''}`,
    link: '/maintenance/work-orders',
    entityType: 'workOrder',
    entityId: result.insertedId.toString(),
  });

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
      const mechOid = ObjectId.createFromHexString(input.assigneeId);
      $set.assigneeId = mechOid;
      // Resolve the mechanic from tenantMembers (same source as /api/users).
      const membersCol = await getTenantMembersCollection();
      const member = await membersCol.findOne({ _id: mechOid, tenantId: tenantOid });
      if (member) {
        const name = (member.name as string)
          || `${(member.firstName as string) || ''} ${(member.lastName as string) || ''}`.trim();
        $set.assigneeName = name;
        $set.assigneeContact = name;
        $set.assigneeEmail = (member.email as string) || undefined;
        $set.assigneePhone = (member.phoneNumber as string) || undefined;
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

  // Parts — recompute lines + total; inventory delta applied after the write.
  let partsBefore: WOPart[] | null = null;
  let partsAfter: WOPart[] | null = null;
  if (input.parts !== undefined) {
    const resolved = await resolveWorkOrderParts(tenantOid, input.parts);
    $set.parts = resolved.parts;
    $set.partsCost = resolved.partsCost;
    partsBefore = (existing.parts as WOPart[]) || [];
    partsAfter = resolved.parts;
  }

  // Attachments
  if (input.attachments !== undefined) {
    $set.attachments = input.attachments.map((a) => ({
      ...a,
      uploadedAt: new Date(),
    }));
  }

  await col.updateOne({ _id: woOid, tenantId: tenantOid }, { $set });

  // Apply the net inventory change for any parts edits.
  if (partsBefore !== null && partsAfter !== null) {
    await applyInventoryDelta(tenantOid, partsBefore, partsAfter, ObjectId.createFromHexString(userId));
  }

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

  // Return any parts to inventory (the work was cancelled).
  const existingParts = (existing.parts as WOPart[]) || [];
  if (result.modifiedCount > 0 && existingParts.length > 0) {
    await applyInventoryDelta(tenantOid, existingParts, [], ObjectId.createFromHexString(userId));
  }

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

  // Notify the assignee + managers of the status change (best-effort). Covers
  // on-hold / reopened / any transition — driven by the tenant's custom statuses.
  const statusPayload = {
    type: 'work_order_status_changed' as const,
    title: `Work order ${(existing.workOrderNumber as string) || ''} → ${newStatus.label}`,
    body: `${(existing.assetName as string) || 'Asset'} status changed to "${newStatus.label as string}".`,
    link: '/maintenance/work-orders',
    entityType: 'workOrder',
    entityId: woOid.toString(),
  };
  if (existing.assigneeType === 'mechanic' && existing.assigneeId) {
    await notifyUser(tenantId, existing.assigneeId as ObjectId, statusPayload);
  }
  await notifyTenantManagers(tenantId, statusPayload);

  const updated = await col.findOne({ _id: woOid });
  return { data: updated ? serializeWorkOrder(updated as Record<string, unknown>) : null, error: null };
}

// ---------------------------------------------------------------------------
// Complete & sign off
// ---------------------------------------------------------------------------

/**
 * Complete a work order: mark it done, resolve its linked defects, return the
 * asset to service, and (when service tasks/programs were fulfilled) log a
 * service-history entry that resets the schedule. Idempotent — re-completing
 * an already-completed WO is a no-op.
 */
export async function completeWorkOrder(
  tenantId: string,
  userId: string,
  woId: string,
  input: { servicePrograms?: string[]; meterAtService?: number; meterType?: string; notes?: string } = {},
) {
  const col = await getWorkOrdersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const woOid = ObjectId.createFromHexString(woId);
  const userOid = ObjectId.createFromHexString(userId);

  const wo = await col.findOne({ _id: woOid, tenantId: tenantOid, isArchived: { $ne: true } });
  if (!wo) return { data: null, error: 'Work order not found' };
  if (wo.isCompleted) {
    return { data: serializeWorkOrder(wo as Record<string, unknown>), error: null };
  }

  const now = new Date();

  // 1) Mark completed (deterministic flag, independent of free-form status).
  await col.updateOne(
    { _id: woOid, tenantId: tenantOid },
    { $set: { isCompleted: true, completedAt: now, completedBy: userOid, updatedBy: userOid, updatedAt: now } },
  );

  // 2) Resolve linked defects → corrected.
  const defectOids = Array.isArray(wo.defectIds) ? (wo.defectIds as ObjectId[]) : [];
  if (defectOids.length > 0) {
    const defectsCol = await getDefectsCollection();
    await defectsCol.updateMany(
      { _id: { $in: defectOids }, tenantId: tenantOid, isArchived: { $ne: true } },
      { $set: { status: 'corrected', updatedBy: userOid, updatedAt: now } },
    );
  }

  // 3) Return the asset to service.
  if (wo.assetId) {
    const assetsCol = await getAssetsCollection();
    await assetsCol.updateOne(
      { _id: wo.assetId as ObjectId, tenantId: tenantOid },
      { $set: { status: 'in_service', updatedAt: now } },
    );
  }

  // 4) Log a service entry when this WO fulfilled scheduled work.
  const programs = (input.servicePrograms || []).filter((id) => ObjectId.isValid(id));
  const taskIds = (Array.isArray(wo.serviceTaskIds) ? (wo.serviceTaskIds as ObjectId[]) : []).map((id) => id.toString());
  if ((programs.length > 0 || taskIds.length > 0) && wo.assetId) {
    const performedById =
      wo.assigneeType === 'mechanic' && wo.assigneeId ? (wo.assigneeId as ObjectId).toString() : userId;
    await logServiceEntry(
      tenantId,
      userId,
      {
        assetId: (wo.assetId as ObjectId).toString(),
        workOrderId: woId,
        servicePrograms: programs,
        serviceTaskIds: taskIds,
        meterType: input.meterType,
        meterAtService: input.meterAtService,
        totalCost: typeof wo.partsCost === 'number' ? (wo.partsCost as number) : undefined,
        notes: input.notes,
      },
      { source: 'work_order', performedById },
    );
  }

  // 5) Notify managers the WO is complete.
  await notifyTenantManagers(tenantId, {
    type: 'work_order_completed',
    title: `Work order ${wo.workOrderNumber} completed`,
    body: `${(wo.assetName as string) || 'Asset'} — ${wo.workOrderNumber} completed${defectOids.length ? `, ${defectOids.length} defect(s) corrected` : ''}.`,
    link: '/maintenance/work-orders',
    entityType: 'workOrder',
    entityId: woId,
  });

  const completed = await col.findOne({ _id: woOid });
  return { data: completed ? serializeWorkOrder(completed as Record<string, unknown>) : null, error: null };
}
