/**
 * Faults controller — CRUD operations for manually-reported faults.
 */
import { ObjectId } from 'mongodb';
import {
  getFaultsCollection,
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
  generateFaultNumber,
} from './utils';
import { notifyTenantManagers } from '@/controller/notifications';

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
  },
) {
  const collection = await getFaultsCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const tenantOid = ObjectId.createFromHexString(tenantId);

  const filter: Record<string, unknown> = {
    tenantId: tenantOid,
    isArchived: { $ne: true },
  };

  if (options.status) filter.status = options.status;
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
      { faultNumber: regex },
      { title: regex },
    ];
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  // Resolve names on read
  const assetIds = [...new Map(items.map((i) => [(i.assetId as ObjectId).toString(), i.assetId as ObjectId])).values()];
  const reporters = items.map((i) => ({
    reportedByType: i.reportedByType as string,
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
        reportedByName: reporterNameMap.get((item.reportedById as ObjectId).toString()),
        teamNames,
      });
    }),
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

// ─── Get by ID ───────────────────────────────────────────────────────────────

export async function getFaultById(tenantId: string, id: string) {
  const collection = await getFaultsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(id),
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });

  if (!doc) return null;

  // Resolve names
  const assetNameMap = await resolveAssetNames(tenantOid, [doc.assetId as ObjectId]);
  const reporterNameMap = await resolveReporterNames(tenantOid, [
    { reportedByType: doc.reportedByType as string, reportedById: doc.reportedById as ObjectId },
  ]);

  return serializeFault(doc as unknown as Record<string, unknown>, {
    assetName: assetNameMap.get((doc.assetId as ObjectId).toString()),
    reportedByName: reporterNameMap.get((doc.reportedById as ObjectId).toString()),
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

  const collection = await getFaultsCollection();
  const now = new Date();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);

  const faultNumber = await generateFaultNumber(tenantId);

  const severity = input.severity || (input.priority === 'high' ? 'critical' : 'non_critical');

  const doc = {
    tenantId: tenantOid,
    faultNumber,
    title: input.title.trim(),
    description: input.description.trim(),
    reportedAt: new Date(input.reportedAt),
    assetId: ObjectId.createFromHexString(input.assetId),
    reportedByType: input.reportedByType,
    reportedById: ObjectId.createFromHexString(input.reportedById),
    category: input.category,
    priority: input.priority,
    severity,
    status: 'open' as const,
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
    } catch {
      // Best-effort
    }
  }

  // Resolve names for the response
  const assetNameMap = await resolveAssetNames(tenantOid, [ObjectId.createFromHexString(input.assetId)]);
  const reporterNameMap = await resolveReporterNames(tenantOid, [
    { reportedByType: input.reportedByType, reportedById: ObjectId.createFromHexString(input.reportedById) },
  ]);

  // Notify managers (best-effort)
  await notifyTenantManagers(tenantId, {
    type: 'fault_reported',
    title: `Fault ${faultNumber} reported`,
    body: `${assetNameMap.get(input.assetId) || 'Asset'} — ${input.title.trim()}${doc.takeOutOfService ? ' (asset grounded)' : ''}`,
    link: '/maintenance/faults',
    entityType: 'fault',
    entityId: result.insertedId.toString(),
  });

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
  const collection = await getFaultsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const oid = ObjectId.createFromHexString(id);

  const existing = await collection.findOne({
    _id: oid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });
  if (!existing) return { data: null, error: 'Fault not found' };

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  if (input.title !== undefined) $set.title = input.title.trim();
  if (input.description !== undefined) $set.description = input.description.trim();
  if (input.reportedAt !== undefined) $set.reportedAt = new Date(input.reportedAt);
  if (input.category !== undefined) $set.category = input.category;
  if (input.priority !== undefined) {
    $set.priority = input.priority;
    $set.severity = input.priority === 'high' ? 'critical' : 'non_critical';
  }
  if (input.severity !== undefined) $set.severity = input.severity;
  if (input.status !== undefined) $set.status = input.status;
  if (input.meterType !== undefined) $set.meterType = input.meterType || null;
  if (input.meterReading !== undefined) $set.meterReading = input.meterReading ?? null;
  if (input.takeOutOfService !== undefined) $set.takeOutOfService = input.takeOutOfService;

  if (input.assetId !== undefined) {
    $set.assetId = ObjectId.createFromHexString(input.assetId);
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

  // Resolve names for the response
  const assetNameMap = await resolveAssetNames(tenantOid, [updated.assetId as ObjectId]);
  const reporterNameMap = await resolveReporterNames(tenantOid, [
    { reportedByType: updated.reportedByType as string, reportedById: updated.reportedById as ObjectId },
  ]);

  return {
    data: serializeFault(updated as unknown as Record<string, unknown>, {
      assetName: assetNameMap.get((updated.assetId as ObjectId).toString()),
      reportedByName: reporterNameMap.get((updated.reportedById as ObjectId).toString()),
    }),
    error: null,
  };
}

// ─── Delete (soft) ───────────────────────────────────────────────────────────

export async function deleteFault(tenantId: string, userId: string, id: string) {
  const collection = await getFaultsCollection();
  const result = await collection.updateOne(
    {
      _id: ObjectId.createFromHexString(id),
      tenantId: ObjectId.createFromHexString(tenantId),
      isArchived: { $ne: true },
    },
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

  const collection = await getFaultsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const now = new Date();

  const result = await collection.updateMany(
    {
      _id: { $in: ids.map((id) => ObjectId.createFromHexString(id)) },
      tenantId: tenantOid,
      isArchived: { $ne: true },
    },
    {
      $set: {
        status,
        updatedBy: ObjectId.createFromHexString(userId),
        updatedAt: now,
      },
    },
  );

  return { data: { modifiedCount: result.modifiedCount }, error: null };
}
