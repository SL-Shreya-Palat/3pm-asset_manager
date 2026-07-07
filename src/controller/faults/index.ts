/**
 * Faults controller — CRUD operations for manually-reported faults.
 *
 * Faults are now stored in the **defects** collection with `source: 'fault'`.
 * This controller translates between the fault API format and the defect
 * document format so the faults UI continues to work unchanged.
 */
import { ObjectId } from 'mongodb';
import {
  getDefectsCollection,
  getAssetsCollection,
  getDriversCollection,
  getTenantMembersCollection,
  getTeamsCollection,
} from '@/lib/mongodb';
import type { CreateFaultInput, UpdateFaultInput } from './types';
import { FAULT_STATUSES } from './types';
import {
  validateCreateFaultInput,
  serializeFault,
  FAULT_TO_DEFECT_STATUS,
} from './utils';
import { generateDefectNumber } from '@/controller/defects/utils';
import { notifyEvent } from '@/controller/notifications';
import {
  writebackActivityIfLinked,
  writebackAvailabilityIfLinked,
} from '@/controller/command-connection/hooks';

// ── Helpers — resolve names on READ ─────────────────────────────────────────

/** Build an id→name map for assets. */
async function resolveAssetNames(
  tenantOid: ObjectId,
  assetIds: ObjectId[],
): Promise<Map<string, string>> {
  if (assetIds.length === 0) return new Map();
  const col = await getAssetsCollection();
  const docs = await col
    .find({ _id: { $in: assetIds }, tenantId: tenantOid }, { projection: { name: 1 } })
    .toArray();
  return new Map(docs.map((d) => [d._id.toString(), (d.name as string) || '']));
}

/** Build an id→name map for reporters (driver or tenant member). */
async function resolveReporterNames(
  tenantOid: ObjectId,
  items: Array<{ reportedByType: string; reportedById: ObjectId }>,
): Promise<Map<string, string>> {
  const driverIds: ObjectId[] = [];
  const memberIds: ObjectId[] = [];
  for (const item of items) {
    if (item.reportedByType === 'driver') driverIds.push(item.reportedById);
    else memberIds.push(item.reportedById);
  }

  const map = new Map<string, string>();

  if (driverIds.length > 0) {
    const col = await getDriversCollection();
    const docs = await col
      .find({ _id: { $in: driverIds }, tenantId: tenantOid }, { projection: { firstName: 1, lastName: 1 } })
      .toArray();
    for (const d of docs) {
      const name = `${(d.firstName as string) || ''} ${(d.lastName as string) || ''}`.trim();
      map.set(d._id.toString(), name || '');
    }
  }

  if (memberIds.length > 0) {
    const col = await getTenantMembersCollection();
    const docs = await col
      .find({ _id: { $in: memberIds }, tenantId: tenantOid }, { projection: { name: 1, firstName: 1, lastName: 1, email: 1 } })
      .toArray();
    for (const d of docs) {
      const name =
        (d.name as string) ||
        `${(d.firstName as string) || ''} ${(d.lastName as string) || ''}`.trim() ||
        (d.email as string) ||
        '';
      map.set(d._id.toString(), name);
    }
  }

  return map;
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function getAllFaults(
  tenantId: string,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    category?: string;
    priority?: string;
    severity?: string;
    teamId?: string;
    assetId?: string;
    showArchived?: boolean;
    createdBy?: string;
  },
) {
  const collection = await getDefectsCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const tenantOid = ObjectId.createFromHexString(tenantId);

  const filter: Record<string, unknown> = {
    tenantId: tenantOid,
    source: 'fault',
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

  // Map fault status → defect status for the query
  if (options.status) {
    filter.status = FAULT_TO_DEFECT_STATUS[options.status] || options.status;
  }
  if (options.category) filter.category = options.category;
  if (options.priority) filter.priority = options.priority;
  if (options.severity) filter.severity = options.severity;

  if (options.teamId) {
    filter.teamIds = ObjectId.createFromHexString(options.teamId);
  }

  if (options.assetId && ObjectId.isValid(options.assetId)) {
    filter.assetId = ObjectId.createFromHexString(options.assetId);
  }

  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    filter.$or = [
      { defectNumber: regex },
      { name: regex },
    ];
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  // Resolve names on read
  const assetIds = [...new Map(items.map((i) => [(i.assetId as ObjectId).toString(), i.assetId as ObjectId])).values()];
  const reporters = items
    .filter((i) => i.reportedById)
    .map((i) => ({
      reportedByType: (i.reportedByType as string) || 'member',
      reportedById: i.reportedById as ObjectId,
    }));

  const [assetNameMap, reporterNameMap, teamNameMap] = await Promise.all([
    resolveAssetNames(tenantOid, assetIds),
    resolveReporterNames(tenantOid, reporters),
    (async () => {
      const allTeamIds = items
        .flatMap((item) => (Array.isArray(item.teamIds) ? item.teamIds : []))
        .filter((id) => id) as ObjectId[];
      const uniqueTeamIds = [...new Map(allTeamIds.map((id) => [id.toString(), id])).values()];
      if (uniqueTeamIds.length === 0) return new Map<string, string>();
      const teamsCol = await getTeamsCollection();
      const teamDocs = await teamsCol.find({ _id: { $in: uniqueTeamIds } }).toArray();
      return new Map(teamDocs.map((t) => [t._id.toString(), t.name as string]));
    })(),
  ]);

  return {
    items: items.map((item) => {
      const itemTeamIds = Array.isArray(item.teamIds)
        ? (item.teamIds as ObjectId[]).map((id) => id.toString())
        : [];
      const teamNames = itemTeamIds.map((id) => teamNameMap.get(id)).filter(Boolean) as string[];
      return serializeFault(item as unknown as Record<string, unknown>, {
        assetName: assetNameMap.get((item.assetId as ObjectId).toString()),
        reportedByName: item.reportedById
          ? reporterNameMap.get((item.reportedById as ObjectId).toString())
          : undefined,
        teamNames,
      });
    }),
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

// ─── Get by ID ───────────────────────────────────────────────────────────────

export async function getFaultById(tenantId: string, id: string) {
  const collection = await getDefectsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(id),
    tenantId: tenantOid,
    isArchived: { $ne: true },
    source: 'fault',
  });

  if (!doc) return null;

  // Resolve names
  const assetNameMap = await resolveAssetNames(tenantOid, [doc.assetId as ObjectId]);
  const reporterNameMap = doc.reportedById
    ? await resolveReporterNames(tenantOid, [
        { reportedByType: (doc.reportedByType as string) || 'member', reportedById: doc.reportedById as ObjectId },
      ])
    : new Map<string, string>();

  return serializeFault(doc as unknown as Record<string, unknown>, {
    assetName: assetNameMap.get((doc.assetId as ObjectId).toString()),
    reportedByName: doc.reportedById
      ? reporterNameMap.get((doc.reportedById as ObjectId).toString())
      : undefined,
  });
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createFault(
  tenantId: string,
  userId: string,
  input: CreateFaultInput,
) {
  const validation = validateCreateFaultInput(input);
  if (!validation.valid) {
    return { data: null, error: validation.errors };
  }

  const collection = await getDefectsCollection();
  const now = new Date();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);

  // Use the defect number counter (DF-xxxx)
  const defectNumber = await generateDefectNumber(tenantId);

  const priority = input.priority || 'medium';
  const severity = input.severity || priority;

  // Resolve asset name (denormalized storage) + its teams (notification routing).
  let assetName = '';
  let assetTeamIds: ObjectId[] = [];
  try {
    const assetsCol = await getAssetsCollection();
    const asset = await assetsCol.findOne({
      _id: ObjectId.createFromHexString(input.assetId),
      tenantId: tenantOid,
    });
    assetName = (asset?.name as string) || '';
    assetTeamIds = (asset?.teamIds as ObjectId[]) ?? [];
  } catch {
    // Silent — assetName stays empty
  }

  // Build defect document with fault-specific extra fields
  const doc = {
    tenantId: tenantOid,
    defectNumber,
    // Fault → Defect field mapping
    name: input.title.trim(),                        // title → name
    date: new Date(input.reportedAt),                // reportedAt → date
    comment: input.description?.trim() || input.title.trim(), // description → comment
    assetId: ObjectId.createFromHexString(input.assetId),
    assetName,
    // Inherit the asset's teams so the Defects tab is populated and fault
    // notifications route to the responsible team(s).
    teamIds: assetTeamIds,
    driverId: null as ObjectId | null,
    driverName: null as string | null,
    priority,
    severity,
    status: 'new' as const,                          // fault 'open' → defect 'new'
    source: 'fault' as const,
    // Fault-specific fields stored as extra data on the defect doc
    reportedByType: input.reportedByType || 'member',
    reportedById: ObjectId.createFromHexString(input.reportedById),
    category: input.category || 'other',
    meterType: input.meterType || null,
    meterReading: input.meterReading ?? null,
    takeOutOfService: input.takeOutOfService ?? false,
    attachments: (input.attachments || []).map((a) => ({
      url: a.url,
      filename: a.filename,
      originalName: a.originalName,
      contentType: a.contentType,
      size: a.size,
      uploadedAt: now,
    })),
    createdBy: userOid,
    updatedBy: userOid,
    createdAt: now,
    updatedAt: now,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  };

  const result = await collection.insertOne(doc);

  // If takeOutOfService → ground the asset now
  if (doc.takeOutOfService) {
    try {
      const assetsCol = await getAssetsCollection();
      await assetsCol.updateOne(
        { _id: ObjectId.createFromHexString(input.assetId), tenantId: tenantOid },
        { $set: { status: 'out_of_service', updatedAt: now } },
      );
      // Command-linked assets: mirror the grounding to Command.
      await writebackAvailabilityIfLinked(
        tenantId,
        input.assetId,
        true,
        `Fault ${defectNumber}: ${input.title.trim()}`,
      );
    } catch {
      // Best-effort
    }
  }

  // Command-linked assets: append the fault to the Command activity timeline.
  await writebackActivityIfLinked(tenantId, input.assetId, {
    type: 'fault_raised',
    summary: `Fault ${defectNumber} reported — ${input.title.trim()}`,
    details: { defectNumber, ...(doc.takeOutOfService ? { takeOutOfService: true } : {}) },
  });

  // Resolve names for the response
  const assetNameMap = await resolveAssetNames(tenantOid, [ObjectId.createFromHexString(input.assetId)]);
  const reporterNameMap = await resolveReporterNames(tenantOid, [
    { reportedByType: (input.reportedByType ?? 'member') as string, reportedById: ObjectId.createFromHexString(input.reportedById) },
  ]);

  // Notify the responsible team (best-effort; falls back to all managers).
  await notifyEvent(
    tenantId,
    {
      type: 'fault_reported',
      title: `Fault ${defectNumber} reported`,
      body: `${assetNameMap.get(input.assetId) || 'Asset'} — ${input.title.trim()}${doc.takeOutOfService ? ' (asset grounded)' : ''}`,
      link: '/maintenance/faults',
      entityType: 'fault',
      entityId: result.insertedId.toString(),
    },
    { teamIds: assetTeamIds },
  );

  return {
    data: serializeFault({ ...doc, _id: result.insertedId } as unknown as Record<string, unknown>, {
      assetName: assetNameMap.get(input.assetId),
      reportedByName: reporterNameMap.get(input.reportedById),
    }),
    error: null,
  };
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateFault(
  tenantId: string,
  userId: string,
  id: string,
  input: UpdateFaultInput,
) {
  const collection = await getDefectsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const oid = ObjectId.createFromHexString(id);

  const existing = await collection.findOne({
    _id: oid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
    source: 'fault',
  });
  if (!existing) return { data: null, error: 'Fault not found' };

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  // Map fault fields → defect fields
  if (input.title !== undefined) $set.name = input.title.trim();
  if (input.description !== undefined) $set.comment = input.description.trim();
  if (input.reportedAt !== undefined) $set.date = new Date(input.reportedAt);
  if (input.category !== undefined) $set.category = input.category;
  if (input.priority !== undefined) {
    $set.priority = input.priority;
    $set.severity = input.priority;
  }
  if (input.severity !== undefined) $set.severity = input.severity;
  // Map fault status → defect status
  if (input.status !== undefined) {
    $set.status = FAULT_TO_DEFECT_STATUS[input.status] || input.status;
  }
  if (input.meterType !== undefined) $set.meterType = input.meterType || null;
  if (input.meterReading !== undefined) $set.meterReading = input.meterReading ?? null;
  if (input.takeOutOfService !== undefined) $set.takeOutOfService = input.takeOutOfService;

  if (input.assetId !== undefined) {
    $set.assetId = ObjectId.createFromHexString(input.assetId);
    // Re-resolve asset name
    try {
      const assetsCol = await getAssetsCollection();
      const asset = await assetsCol.findOne({
        _id: ObjectId.createFromHexString(input.assetId),
        tenantId: tenantOid,
      });
      $set.assetName = (asset?.name as string) || '';
    } catch {
      $set.assetName = '';
    }
  }

  if (input.reportedByType !== undefined) $set.reportedByType = input.reportedByType;
  if (input.reportedById !== undefined) {
    $set.reportedById = ObjectId.createFromHexString(input.reportedById);
  }

  if (input.attachments !== undefined) {
    $set.attachments = input.attachments.map((a) => ({
      url: a.url,
      filename: a.filename,
      originalName: a.originalName,
      contentType: a.contentType,
      size: a.size,
      uploadedAt: new Date(),
    }));
  }

  await collection.updateOne({ _id: oid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: oid });

  if (!updated) return { data: null, error: null };

  // Command-linked assets: mirror a resolve (open → corrected/no-correction).
  const RESOLVED = ['corrected', 'no_correction_needed'];
  const newDefectStatus =
    input.status !== undefined ? FAULT_TO_DEFECT_STATUS[input.status] || input.status : undefined;
  const wasResolved = RESOLVED.includes(existing.status as string);
  if (newDefectStatus && RESOLVED.includes(newDefectStatus) && !wasResolved) {
    await writebackActivityIfLinked(tenantId, (updated.assetId as ObjectId).toString(), {
      type: 'fault_resolved',
      summary: `Fault ${(existing.defectNumber as string) || ''} resolved`.trim(),
      details: { defectNumber: existing.defectNumber, status: newDefectStatus },
    });
  }

  // Resolve names for the response
  const assetNameMap = await resolveAssetNames(tenantOid, [updated.assetId as ObjectId]);
  const reporterNameMap = updated.reportedById
    ? await resolveReporterNames(tenantOid, [
        { reportedByType: (updated.reportedByType as string) || 'member', reportedById: updated.reportedById as ObjectId },
      ])
    : new Map<string, string>();

  return {
    data: serializeFault(updated as unknown as Record<string, unknown>, {
      assetName: assetNameMap.get((updated.assetId as ObjectId).toString()),
      reportedByName: updated.reportedById
        ? reporterNameMap.get((updated.reportedById as ObjectId).toString())
        : undefined,
    }),
    error: null,
  };
}

// ─── Delete ──────────────────────────────────────────────────────────────────

/** Permanently delete a fault. */
export async function deleteFault(tenantId: string, userId: string, id: string) {
  const collection = await getDefectsCollection();
  const docOid = ObjectId.createFromHexString(id);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const result = await collection.deleteOne({ _id: docOid, tenantId: tenantOid });
  return result.deletedCount > 0;
}

// ─── Bulk Status Update ──────────────────────────────────────────────────────

export async function bulkUpdateFaultStatus(
  tenantId: string,
  userId: string,
  ids: string[],
  status: string,
) {
  if (!ids.length) return { data: null, error: 'No fault IDs provided' };

  if (!(FAULT_STATUSES as readonly string[]).includes(status)) {
    return { data: null, error: `Status must be one of: ${FAULT_STATUSES.join(', ')}` };
  }

  const collection = await getDefectsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const now = new Date();

  // Map fault status → defect status before persisting
  const defectStatus = FAULT_TO_DEFECT_STATUS[status] || status;
  const oids = ids.map((id) => ObjectId.createFromHexString(id));
  const RESOLVED = ['corrected', 'no_correction_needed'];

  // Capture faults transitioning INTO a resolved state for the Command timeline.
  let transitioning: Array<{ assetId: ObjectId; defectNumber: unknown }> = [];
  if (RESOLVED.includes(defectStatus)) {
    transitioning = (await collection
      .find(
        { _id: { $in: oids }, tenantId: tenantOid, source: 'fault', status: { $nin: RESOLVED } },
        { projection: { assetId: 1, defectNumber: 1 } },
      )
      .toArray()) as unknown as Array<{ assetId: ObjectId; defectNumber: unknown }>;
  }

  const result = await collection.updateMany(
    { _id: { $in: oids }, tenantId: tenantOid, isArchived: { $ne: true }, source: 'fault' },
    {
      $set: {
        status: defectStatus,
        updatedBy: ObjectId.createFromHexString(userId),
        updatedAt: now,
      },
    },
  );

  for (const f of transitioning) {
    if (!f.assetId) continue;
    await writebackActivityIfLinked(tenantId, f.assetId.toString(), {
      type: 'fault_resolved',
      summary: `Fault ${(f.defectNumber as string) || ''} resolved`.trim(),
      details: { defectNumber: f.defectNumber, status: defectStatus },
    });
  }

  return { data: { modifiedCount: result.modifiedCount }, error: null };
}
