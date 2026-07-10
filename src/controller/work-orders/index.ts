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
import { formatDate } from '@/lib/utils';
import {
  resolveWorkOrderParts,
  resolveCommandStockParts,
  applyInventoryDelta,
} from './parts-inventory';
import { getEnabledConnectionAuthTenantId } from '@/controller/command-connection/guard';
import { getCommandStockLevels, getCommandStockItem, pushStockOut } from '@/lib/command/stock';
import { getUsersCollection } from '@/lib/mongodb';
import { notifyUser, notifyEvent } from '@/controller/notifications';
import { logServiceEntry } from '@/controller/service-history';
import {
  writebackActivityIfLinked,
  writebackAvailabilityIfLinked,
} from '@/controller/command-connection/hooks';

/** Teams that own a work order's asset — used to route WO notifications. */
async function resolveWorkOrderAssetTeamIds(
  tenantOid: ObjectId,
  assetId: unknown,
): Promise<ObjectId[]> {
  if (!(assetId instanceof ObjectId)) return [];
  const assetsCol = await getAssetsCollection();
  const asset = await assetsCol.findOne({ _id: assetId, tenantId: tenantOid }, { projection: { teamIds: 1 } });
  return (asset?.teamIds as ObjectId[]) ?? [];
}

// ---------------------------------------------------------------------------
// List work orders
// ---------------------------------------------------------------------------

export async function getAllWorkOrders(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; statusId?: string; assigneeId?: string; assetId?: string; showArchived?: boolean; createdBy?: string },
) {
  const col = await getWorkOrdersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const filter: Record<string, unknown> = {
    tenantId: tenantOid,
  };

  // "OWN" view scope — only show records created by this user
  if (options.createdBy) {
    filter.createdBy = ObjectId.createFromHexString(options.createdBy);
  }

  if (options.showArchived) {
    filter.isArchived = true;
  } else {
    filter.isArchived = { $ne: true };
  }

  // Asset filter (e.g. the work orders for one asset).
  if (options.assetId) {
    try {
      filter.assetId = ObjectId.createFromHexString(options.assetId);
    } catch {
      // Invalid ObjectId, ignore filter
    }
  }

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

  // Resolve asset name + its teams (for notification routing)
  const assetsCol = await getAssetsCollection();
  const asset = await assetsCol.findOne({ _id: ObjectId.createFromHexString(input.assetId) });
  const assetName = (asset?.name as string) || '';
  const assetTeamIds = (asset?.teamIds as ObjectId[]) ?? [];

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

  // Source + linked defects/faults.
  const defectOids = (Array.isArray(input.defectIds) ? input.defectIds : [])
    .filter((id) => ObjectId.isValid(id))
    .map((id) => ObjectId.createFromHexString(id));
  const faultOids = (Array.isArray(input.faultIds) ? input.faultIds : [])
    .filter((id) => ObjectId.isValid(id))
    .map((id) => ObjectId.createFromHexString(id));

  // Determine source: fault > defect > passed-in/manual
  let source: string = input.source || 'manual';
  if (faultOids.length > 0 && source !== 'defect') source = 'fault';
  else if (defectOids.length > 0) source = 'defect';
  if (!['manual', 'defect', 'fault'].includes(source)) source = 'manual';

  // Parts → denormalized lines + total (local stock deducted after insert;
  // Command stock lines are pushed to Command at completion, not here).
  const local = await resolveWorkOrderParts(tenantOid, input.parts);
  const hasCommandLines = (input.parts || []).some((p) => p?.commandStockId);
  let commandLines: { parts: WOPart[]; partsCost: number } = { parts: [], partsCost: 0 };
  if (hasCommandLines) {
    const authTenantId = await getEnabledConnectionAuthTenantId(tenantOid);
    if (!authTenantId) {
      return {
        data: null,
        error: 'This work order uses Command stock, but the Command connection is off.',
      };
    }
    try {
      commandLines = await resolveCommandStockParts(authTenantId, input.parts);
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : 'Command stock lookup failed' };
    }
  }
  const parts = [...local.parts, ...commandLines.parts];
  const partsCost = Math.round((local.partsCost + commandLines.partsCost) * 100) / 100;

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    workOrderNumber,
    assetId: ObjectId.createFromHexString(input.assetId),
    assetName,
    serviceTaskIds: (input.serviceTaskIds || []).map((id) => ObjectId.createFromHexString(id)),
    source,
    defectIds: defectOids,
    faultIds: faultOids,
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

  // Link faults (stored in defects collection with source='fault') → mark in_progress + back-reference this WO.
  if (faultOids.length > 0) {
    const defectsCol2 = await getDefectsCollection();
    await defectsCol2.updateMany(
      { _id: { $in: faultOids }, tenantId: tenantOid, isArchived: { $ne: true }, source: 'fault' },
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
      body: `${assetName || 'Asset'} — ${statusLabel || 'New'}${input.dueDate ? `, due ${formatDate(input.dueDate)}` : ''}`,
      link: '/maintenance/work-orders',
      entityType: 'workOrder',
      entityId: result.insertedId.toString(),
    });
  }

  // Notify the responsible team a new work order was created (best-effort).
  await notifyEvent(
    tenantId,
    {
      type: 'work_order_created',
      title: `Work order ${workOrderNumber} created`,
      body: `${assetName || 'Asset'}${statusLabel ? ` — ${statusLabel}` : ''}${input.dueDate ? `, due ${formatDate(input.dueDate)}` : ''}`,
      link: '/maintenance/work-orders',
      entityType: 'workOrder',
      entityId: result.insertedId.toString(),
    },
    { teamIds: assetTeamIds },
  );

  // Command-linked assets: mirror the raised work order onto Command's timeline.
  await writebackActivityIfLinked(tenantId, input.assetId, {
    type: 'work_order_raised',
    summary: `Work order ${workOrderNumber} raised${statusLabel ? ` — ${statusLabel}` : ''}`,
    details: {
      workOrderNumber,
      source,
      ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    },
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
    // An AM-side edit freezes the doc against history re-import refreshes
    // (no-op for WOs that weren't imported from Command).
    commandImportManaged: false,
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
  // Completed WOs are cost-frozen: partsCost was snapshotted into service
  // history at completion and Command lines were already consumed, so parts
  // edits are ignored (every other field still saves normally).
  let partsBefore: WOPart[] | null = null;
  let partsAfter: WOPart[] | null = null;
  let warning: string | undefined;
  if (input.parts !== undefined && existing.isCompleted) {
    warning =
      'This work order is completed — its stock lines and cost are locked and were not changed.';
  } else if (input.parts !== undefined) {
    const existingParts = (existing.parts as WOPart[]) || [];
    let local = await resolveWorkOrderParts(tenantOid, input.parts);
    const hasCommandLines =
      (input.parts || []).some((p) => p?.commandStockId) ||
      existingParts.some((p) => p.source === 'command');
    let commandLines: { parts: WOPart[]; partsCost: number } = { parts: [], partsCost: 0 };
    if (hasCommandLines) {
      const existingCommand = existingParts.filter(
        (p) => p.source === 'command' && p.commandStockId,
      );
      // Requested command lines, aggregated by stock id.
      const requestedCommand = new Map<string, number>();
      for (const p of input.parts || []) {
        if (!p?.commandStockId) continue;
        const qty = Number(p.quantity);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        requestedCommand.set(
          p.commandStockId,
          (requestedCommand.get(p.commandStockId) || 0) + qty,
        );
      }
      const unchanged =
        requestedCommand.size === existingCommand.length &&
        existingCommand.every(
          (p) => requestedCommand.get(String(p.commandStockId)) === p.quantity,
        );
      if (unchanged) {
        // Command lines untouched — reuse the stored lines verbatim. No live
        // Command lookup, so editing other WO fields works while disconnected.
        commandLines = {
          parts: existingCommand,
          partsCost:
            Math.round(
              existingCommand.reduce((s, p) => s + (Number(p.lineTotal) || 0), 0) * 100,
            ) / 100,
        };
      } else if (requestedCommand.size === 0) {
        // All command lines removed — nothing to resolve; the keep-pushed guard
        // below still retains any line whose OUT already happened.
        commandLines = { parts: [], partsCost: 0 };
      } else {
        const authTenantId = await getEnabledConnectionAuthTenantId(tenantOid);
        if (!authTenantId) {
          return {
            data: null,
            error: 'This work order uses Command stock, but the Command connection is off.',
          };
        }
        try {
          // Passing `existingParts` preserves pushed state — a line already
          // pushed to Command keeps its quantity/transaction and is never re-pushed.
          commandLines = await resolveCommandStockParts(authTenantId, input.parts, existingParts);
        } catch (e) {
          return { data: null, error: e instanceof Error ? e.message : 'Command stock lookup failed' };
        }
      }
      // Dropping an already-pushed line would silently desync the Command
      // ledger (the OUT already happened) — keep it on the WO.
      const kept = new Set(commandLines.parts.map((p) => p.commandStockId));
      for (const prior of existingParts) {
        if (prior.source === 'command' && prior.pushedToCommand && !kept.has(prior.commandStockId)) {
          commandLines.parts.push(prior);
          commandLines.partsCost = Math.round((commandLines.partsCost + prior.lineTotal) * 100) / 100;
        }
      }
      // Defense: a client that round-trips an imported Command part by partId
      // only (no commandStockId) makes resolveWorkOrderParts produce a fresh
      // duplicate of a line we already carry — drop the local duplicate.
      const carriedIds = new Set(
        commandLines.parts.map((p) => String(p.commandStockId)).filter(Boolean),
      );
      const dedupedLocal = local.parts.filter(
        (p) =>
          !(p.source === 'command' && p.commandStockId && carriedIds.has(String(p.commandStockId))),
      );
      if (dedupedLocal.length !== local.parts.length) {
        local = {
          parts: dedupedLocal,
          partsCost:
            Math.round(dedupedLocal.reduce((s, p) => s + (Number(p.lineTotal) || 0), 0) * 100) /
            100,
        };
      }
    }
    const combined = [...local.parts, ...commandLines.parts];
    $set.parts = combined;
    $set.partsCost = Math.round((local.partsCost + commandLines.partsCost) * 100) / 100;
    partsBefore = existingParts;
    partsAfter = combined;
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
  return {
    data: updated ? serializeWorkOrder(updated as Record<string, unknown>) : null,
    error: null,
    ...(warning ? { warning } : {}),
  };
}

// ---------------------------------------------------------------------------
// Delete work order
// ---------------------------------------------------------------------------

/**
 * Permanently delete a work order.
 *
 * Money guards: a completed WO is a financial record (its cost was copied to
 * service history and, for Command lines, into Command's ledger) — archive it,
 * don't delete it. A WO holding lines already pushed to Command can't be
 * deleted either: the consumption already happened in Command and this doc
 * holds the only AM-side audit link (transaction ids). Local part lines of a
 * deletable (open) WO are returned to inventory (parts → []), honouring the
 * delta contract documented in parts-inventory.ts.
 */
export async function deleteWorkOrder(
  tenantId: string,
  userId: string,
  woId: string,
): Promise<{ deleted: boolean; error: string | null }> {
  const col = await getWorkOrdersCollection();
  const docOid = ObjectId.createFromHexString(woId);
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);

  const wo = await col.findOne({ _id: docOid, tenantId: tenantOid });
  if (!wo) return { deleted: false, error: 'Work order not found' };

  if (wo.isCompleted) {
    return {
      deleted: false,
      error: 'Completed work orders are a financial record and can’t be deleted. Archive it instead.',
    };
  }
  const parts = (wo.parts as WOPart[] | undefined) || [];
  if (parts.some((p) => p.source === 'command' && p.pushedToCommand)) {
    return {
      deleted: false,
      error:
        'This work order has already consumed Command stock — deleting it would orphan that consumption. Archive it instead.',
    };
  }

  // Return consumed local stock (delete = delta parts → []).
  await applyInventoryDelta(tenantOid, parts, [], userOid);

  const result = await col.deleteOne({ _id: docOid, tenantId: tenantOid });
  return { deleted: result.deletedCount > 0, error: result.deletedCount > 0 ? null : 'Work order not found' };
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
    // An AM-side transition freezes the doc against history re-import refreshes.
    commandImportManaged: false,
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
  const statusTeamIds = await resolveWorkOrderAssetTeamIds(tenantOid, existing.assetId);
  await notifyEvent(tenantId, statusPayload, { teamIds: statusTeamIds });

  const updated = await col.findOne({ _id: woOid });
  return { data: updated ? serializeWorkOrder(updated as Record<string, unknown>) : null, error: null };
}

// ---------------------------------------------------------------------------
// Complete & sign off
// ---------------------------------------------------------------------------

/**
 * Complete a work order: mark it done, resolve its linked defects, return the
 * asset to service, and (when service tasks or a plan schedule were fulfilled) log a
 * service-history entry that resets the schedule. Idempotent — re-completing
 * an already-completed WO is a no-op.
 */
export async function completeWorkOrder(
  tenantId: string,
  userId: string,
  woId: string,
  input: {
    /** Hierarchical plan model: which plan + schedule this WO serviced. */
    servicePlanId?: string;
    servicePlanSchedule?: string;
    meterAtService?: number;
    meterType?: string;
    notes?: string;
  } = {},
) {
  const col = await getWorkOrdersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const woOid = ObjectId.createFromHexString(woId);
  const userOid = ObjectId.createFromHexString(userId);

  const now = new Date();

  // Atomic completion claim — the Command stock OUT below is non-idempotent, so
  // two racing completions (double-click, two tabs) must be stopped BEFORE any
  // push, not discovered after. A crashed run's stale lock expires after 10
  // minutes; sourceRef-keyed pushes make the retry safe even then.
  const lockExpiry = new Date(now.getTime() - 10 * 60 * 1000);
  const wo = await col.findOneAndUpdate(
    {
      _id: woOid,
      tenantId: tenantOid,
      isArchived: { $ne: true },
      isCompleted: { $ne: true },
      $or: [
        { completionLockAt: { $exists: false } },
        { completionLockAt: null },
        { completionLockAt: { $lt: lockExpiry } },
      ],
    },
    { $set: { completionLockAt: now } },
    { returnDocument: 'after' },
  );
  if (!wo) {
    const existing = await col.findOne({ _id: woOid, tenantId: tenantOid, isArchived: { $ne: true } });
    if (!existing) return { data: null, error: 'Work order not found' };
    if (existing.isCompleted) {
      // Idempotent re-complete — already done is success, not an error.
      return { data: serializeWorkOrder(existing as Record<string, unknown>), error: null };
    }
    return { data: null, error: 'This work order is already being completed by someone else — try again shortly.' };
  }

  // Every early exit must release the claim so a fixed-up retry isn't stuck
  // behind the 10-minute expiry.
  const fail = async (error: string) => {
    await col
      .updateOne({ _id: woOid, tenantId: tenantOid }, { $set: { completionLockAt: null } })
      .catch(() => {});
    return { data: null as null, error };
  };

  // 0) Strict lockstep — push unpushed Command stock lines FIRST (same contract
  //    as the dispatch portal's move completion): pre-flight on-hand, push the
  //    OUT (creates a RECEIPTED_OUT stockTransaction in Command), and mark the
  //    line pushed immediately. Completion only proceeds once Command has
  //    accepted every line; any failure blocks completion with nothing lost.
  const woParts = (wo.parts as WOPart[] | undefined) || [];
  const pendingCommandParts = woParts.filter(
    (p) => p.source === 'command' && p.commandStockId && !p.pushedToCommand,
  );
  if (pendingCommandParts.length > 0) {
    const authTenantId = await getEnabledConnectionAuthTenantId(tenantOid);
    if (!authTenantId) {
      return fail(
        'This work order consumes Command stock, but the Command connection is off. Reconnect (Settings → Connections → Command) and try again.',
      );
    }

    // Attribute the Command stock transaction to the completing user.
    let actorEmail: string | undefined;
    try {
      const userDoc = await (await getUsersCollection()).findOne(
        { _id: userOid },
        { projection: { email: 1 } },
      );
      actorEmail = (userDoc?.email as string) || undefined;
    } catch {
      // attribution is best-effort
    }

    for (const part of pendingCommandParts) {
      const stockId = part.commandStockId as string;

      // Pre-flight against the SAME measure Command's OUT endpoint validates:
      // per-location balance when a location was chosen, else the root cached
      // quantity (per-location sums can be empty/partial for location-less
      // stock and would false-block completion).
      if (part.commandLocationId) {
        const levels = await getCommandStockLevels(stockId, authTenantId);
        if (!levels.ok) {
          return fail(
            `Command is unreachable while checking stock for "${part.partName}" — completion blocked, no stock was consumed for this line. Try again shortly.`,
          );
        }
        const onHand = levels.data.find((l) => l.locationId === part.commandLocationId)?.onHand ?? 0;
        if (onHand < part.quantity) {
          return fail(
            `Insufficient Command stock for "${part.partName}": available ${onHand}, required ${part.quantity}.`,
          );
        }
      } else {
        const item = await getCommandStockItem(stockId, authTenantId);
        if (!item.ok) {
          return fail(
            `Command is unreachable while checking stock for "${part.partName}" — completion blocked, no stock was consumed for this line. Try again shortly.`,
          );
        }
        if (item.data.quantity < part.quantity) {
          return fail(
            `Insufficient Command stock for "${part.partName}": available ${item.data.quantity}, required ${part.quantity}.`,
          );
        }
      }

      // No unitCost sent — Command values the OUT at its own costPrice (finance
      // lives in Command). sourceRef makes a crash-retry return the original
      // transaction instead of consuming twice.
      const push = await pushStockOut(
        stockId,
        authTenantId,
        {
          quantity: part.quantity,
          stockLocationId: part.commandLocationId,
          notes: `Drive work order ${wo.workOrderNumber}`,
          sourceRef: `am-wo:${woId}:${stockId}`,
        },
        actorEmail,
      );
      if (!push.ok) {
        return fail(
          push.message ||
            `Command rejected the stock consumption for "${part.partName}" (${push.reason}).`,
        );
      }

      // Mark THIS line pushed immediately — a later failure must never re-push
      // it (Command's OUT endpoint is not idempotent) — and mirror the ledger's
      // actual valuation onto the line so AM's cost never disagrees with the
      // stockTransaction Command recorded.
      const lineSet: Record<string, unknown> = {
        'parts.$[line].pushedToCommand': true,
        'parts.$[line].commandTransactionId': push.data.transactionId,
        updatedAt: new Date(),
      };
      if (push.data.unitCost != null) {
        lineSet['parts.$[line].unitCost'] = push.data.unitCost;
        lineSet['parts.$[line].lineTotal'] =
          push.data.totalCost != null
            ? push.data.totalCost
            : Math.round((push.data.unitCost * part.quantity + Number.EPSILON) * 100) / 100;
      }
      await col.updateOne(
        { _id: woOid, tenantId: tenantOid },
        { $set: lineSet },
        {
          arrayFilters: [
            { 'line.commandStockId': stockId, 'line.pushedToCommand': { $ne: true } },
          ],
        },
      );

      // Keep the imported Inventory snapshot roughly current (display only —
      // Command's ledger is the authority; re-import fully refreshes it).
      try {
        const partsCol = await (await import('@/lib/mongodb')).getPartsCollection();
        await partsCol.updateOne(
          { tenantId: tenantOid, commandStockId: stockId },
          { $inc: { 'stockLocations.$[loc].quantity': -part.quantity }, $set: { updatedAt: new Date() } },
          { arrayFilters: [{ 'loc.locationId': null }] },
        );
      } catch {
        // best-effort
      }
    }
  }

  // 0b) Re-read the parts after the pushes and roll partsCost up from the
  //     ledger-mirrored line totals, so the WO total (and the service-history
  //     snapshot below) matches what Command actually recorded.
  let finalPartsCost = typeof wo.partsCost === 'number' ? (wo.partsCost as number) : undefined;
  if (pendingCommandParts.length > 0) {
    const fresh = await col.findOne(
      { _id: woOid, tenantId: tenantOid },
      { projection: { parts: 1 } },
    );
    const freshParts = (fresh?.parts as WOPart[] | undefined) || [];
    finalPartsCost =
      Math.round(
        (freshParts.reduce((sum, p) => sum + (Number(p.lineTotal) || 0), 0) + Number.EPSILON) * 100,
      ) / 100;
  }

  // 1) Mark completed (deterministic flag, independent of free-form status) and
  //    release the completion claim.
  await col.updateOne(
    { _id: woOid, tenantId: tenantOid },
    {
      $set: {
        isCompleted: true,
        completedAt: now,
        completedBy: userOid,
        completionLockAt: null,
        // Completion in AM freezes the doc against history re-import refreshes.
        commandImportManaged: false,
        updatedBy: userOid,
        updatedAt: now,
        ...(finalPartsCost !== undefined ? { partsCost: finalPartsCost } : {}),
      },
    },
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

  // 2b) Resolve linked faults (stored in defects collection) → corrected.
  const faultOids = Array.isArray(wo.faultIds) ? (wo.faultIds as ObjectId[]) : [];
  if (faultOids.length > 0) {
    const defectsCol2 = await getDefectsCollection();
    await defectsCol2.updateMany(
      { _id: { $in: faultOids }, tenantId: tenantOid, isArchived: { $ne: true }, source: 'fault' },
      { $set: { status: 'corrected', updatedBy: userOid, updatedAt: now } },
    );
  }

  // 3) Return the asset to service + record the completion on Command's timeline.
  if (wo.assetId) {
    const assetsCol = await getAssetsCollection();
    await assetsCol.updateOne(
      { _id: wo.assetId as ObjectId, tenantId: tenantOid },
      { $set: { status: 'in_service', updatedAt: now } },
    );
    // Command-linked assets: mirror the return-to-service + completion activity.
    await writebackAvailabilityIfLinked(
      tenantId,
      wo.assetId as ObjectId,
      false,
      `Work order ${wo.workOrderNumber} completed`,
    );
    await writebackActivityIfLinked(tenantId, wo.assetId as ObjectId, {
      type: 'work_order_completed',
      summary: `Work order ${wo.workOrderNumber} completed`,
      details: {
        workOrderNumber: wo.workOrderNumber as string,
        defectsCorrected: defectOids.length,
        faultsResolved: faultOids.length,
      },
    });
  }

  // 4) Log a service entry when this WO fulfilled scheduled work via the
  //    hierarchical plan model (servicePlanId + schedule) or its service tasks.
  const taskIds = (Array.isArray(wo.serviceTaskIds) ? (wo.serviceTaskIds as ObjectId[]) : []).map((id) => id.toString());
  const hasPlanService = Boolean(input.servicePlanId && input.servicePlanSchedule);
  if ((hasPlanService || taskIds.length > 0) && wo.assetId) {
    const performedById =
      wo.assigneeType === 'mechanic' && wo.assigneeId ? (wo.assigneeId as ObjectId).toString() : userId;
    await logServiceEntry(
      tenantId,
      userId,
      {
        assetId: (wo.assetId as ObjectId).toString(),
        workOrderId: woId,
        servicePlanId: input.servicePlanId,
        servicePlanSchedule: input.servicePlanSchedule,
        serviceTaskIds: taskIds,
        meterType: input.meterType,
        meterAtService: input.meterAtService,
        totalCost: finalPartsCost,
        notes: input.notes,
      },
      { source: 'work_order', performedById },
    );

    // Command-linked assets: mirror the completed service on the activity feed.
    // The meter reading itself is pushed to Command by logServiceEntry above,
    // which honours the tenant's "service updates current meter" setting — so
    // there's no separate meter write-back here (it would double-push and bypass
    // that setting).
    await writebackActivityIfLinked(tenantId, wo.assetId as ObjectId, {
      type: 'service_completed',
      summary: `Service completed via work order ${wo.workOrderNumber}`,
      details: { workOrderNumber: wo.workOrderNumber as string },
    });
  }

  // 5) Notify the responsible team the WO is complete.
  const completeTeamIds = await resolveWorkOrderAssetTeamIds(tenantOid, wo.assetId);
  await notifyEvent(
    tenantId,
    {
      type: 'work_order_completed',
      title: `Work order ${wo.workOrderNumber} completed`,
      body: `${(wo.assetName as string) || 'Asset'} — ${wo.workOrderNumber} completed${defectOids.length ? `, ${defectOids.length} defect(s) corrected` : ''}${faultOids.length ? `, ${faultOids.length} fault(s) resolved` : ''}.`,
      link: '/maintenance/work-orders',
      entityType: 'workOrder',
      entityId: woId,
    },
    { teamIds: completeTeamIds },
  );

  const completed = await col.findOne({ _id: woOid });
  return { data: completed ? serializeWorkOrder(completed as Record<string, unknown>) : null, error: null };
}
