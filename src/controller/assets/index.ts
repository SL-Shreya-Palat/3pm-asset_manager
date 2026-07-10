/**
 * Asset controller — CRUD business logic for assets collection.
 * MongoDB native driver, no Mongoose/ODM.
 */
import { ObjectId } from "mongodb";
import {
  getAssetsCollection,
  getAssetTypesCollection,
  getTeamsCollection,
  getFormsCollection,
  getDocumentsCollection,
} from "@/lib/mongodb";
import { validateCreateAssetInput, serializeAsset } from "./utils";
import { computeDocumentStatus } from "@/controller/documents/utils";
import { writebackAvailabilityIfLinked } from "@/controller/command-connection/hooks";
import {
  isCommandConnectionEnabled,
  stripCommandOwnedFields,
  MASTER_DATA_MANAGED_MESSAGE,
} from "@/controller/command-connection/guard";
import {
  ensureFreshFromCommand,
  ensureFreshAsset,
} from "@/controller/command-connection/auto-sync";
import type { CreateAssetInput, UpdateAssetInput } from "./types";

/** Worst-case compliance rank: expired (3) > expiring soon (2) > valid (1). */
const COMPLIANCE_RANK: Record<string, number> = {
  valid: 1,
  expiring_soon: 2,
  expired: 3,
};
const RANK_STATUS: Record<number, string> = {
  1: "valid",
  2: "expiring_soon",
  3: "expired",
};

/** Reduce raw expiry-bearing docs to the worst compliance status per asset id. */
function worstStatusByAsset(
  docs: Array<Record<string, unknown>>,
  now: Date,
): Map<string, string> {
  const rankByAsset = new Map<string, number>();
  for (const d of docs) {
    const status = computeDocumentStatus(
      d.expiryDate as Date,
      (d.reminderDays as number) ?? 30,
      now,
    );
    const rank = COMPLIANCE_RANK[status];
    if (!rank) continue; // no_expiry can't occur here (expiryDate is non-null), but guard anyway
    const key = (d.assetId as ObjectId).toString();
    if (rank > (rankByAsset.get(key) ?? 0)) rankByAsset.set(key, rank);
  }
  const out = new Map<string, string>();
  for (const [key, rank] of rankByAsset) out.set(key, RANK_STATUS[rank]);
  return out;
}

/**
 * One-query worst-case compliance status for a set of assets, keyed by asset id.
 * Only documents with an expiry date count; assets with none are omitted (→ 'none').
 * Reuses the same `computeDocumentStatus` the compliance tab + reminder scan use.
 */
async function computeComplianceStatusMap(
  tenantOid: ObjectId,
  assetOids: ObjectId[],
): Promise<Map<string, string>> {
  if (assetOids.length === 0) return new Map();
  const docsCol = await getDocumentsCollection();
  const docs = await docsCol
    .find(
      {
        tenantId: tenantOid,
        scope: "asset",
        assetId: { $in: assetOids },
        isArchived: { $ne: true },
        expiryDate: { $ne: null },
      },
      { projection: { assetId: 1, expiryDate: 1, reminderDays: 1 } },
    )
    .toArray();
  return worstStatusByAsset(docs as Array<Record<string, unknown>>, new Date());
}

/**
 * Accurate, fleet-wide asset-id filter for a compliance status — used to filter
 * the assets list SERVER-side (so it's correct across pagination, not just the
 * loaded page). Scans every expiry-bearing asset document for the tenant (no
 * horizon bound, so far-future "valid" docs are still counted).
 *
 * Returns a Mongo `_id` clause: `$in` the matching assets for expired/expiring/
 * valid, or `$nin` the tracked assets for 'none' (assets with no tracked doc).
 */
async function complianceAssetIdClause(
  tenantOid: ObjectId,
  status: string,
): Promise<Record<string, ObjectId[]>> {
  const docsCol = await getDocumentsCollection();
  const docs = await docsCol
    .find(
      {
        tenantId: tenantOid,
        scope: "asset",
        isArchived: { $ne: true },
        expiryDate: { $ne: null },
      },
      { projection: { assetId: 1, expiryDate: 1, reminderDays: 1 } },
    )
    .toArray();
  const worst = worstStatusByAsset(
    docs as Array<Record<string, unknown>>,
    new Date(),
  );

  if (status === "none") {
    // Any asset with a tracked (expiry-bearing) document is NOT 'none'.
    return {
      $nin: [...worst.keys()].map((k) => ObjectId.createFromHexString(k)),
    };
  }
  const matching = [...worst.entries()]
    .filter(([, s]) => s === status)
    .map(([k]) => ObjectId.createFromHexString(k));
  return { $in: matching };
}

/** List assets with pagination, filtering, and search. */
export async function getAllAssets(
  tenantId: string,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    teamId?: string;
    complianceStatus?: string;
    showArchived?: boolean;
    /** Acting user — attributed to any anchors refreshed by the auto-sync. */
    userId?: string;
    createdBy?: string;
    /** When set (driver logins), restrict to assets whose driverAccessIds grants this driver id. */
    driverAccessId?: string;
    /** Team-scoped roles: restrict to assets belonging to any of these teams. */
    teamIds?: string[];
  },
) {
  // Fresh on every call: pull the latest Command assets BEFORE reading local, so
  // a just-added / changed Command asset shows on this load (no-op when
  // standalone; fails fast when Command is unreachable).
  await ensureFreshFromCommand(tenantId, options.userId, "assets");

  const collection = await getAssetsCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const filter: Record<string, unknown> = {
    tenantId: tenantOid,
  };

  if (options.showArchived) {
    filter.isArchived = true;
  } else {
    filter.isArchived = { $ne: true };
  }

  if (options.status) {
    filter.status = options.status;
  }

  // Team restriction (team-scoped roles) composes with the explicit teamId
  // filter: an out-of-scope teamId request yields no results, never a leak.
  if (options.teamIds) {
    const allowed = options.teamIds.filter((id) => ObjectId.isValid(id));
    const effective = options.teamId ? allowed.filter((id) => id === options.teamId) : allowed;
    filter.teamIds = { $in: effective.map((id) => ObjectId.createFromHexString(id)) };
  } else if (options.teamId) {
    filter.teamIds = ObjectId.createFromHexString(options.teamId);
  }

  // "OWN" view scope — only show records created by this user
  if (options.createdBy) {
    filter.createdBy = ObjectId.createFromHexString(options.createdBy);
  }

  // Driver-scoped view: a driver only sees assets they've been granted access
  // to (asset.driverAccessIds contains their driver id).
  if (options.driverAccessId && ObjectId.isValid(options.driverAccessId)) {
    filter.driverAccessIds = ObjectId.createFromHexString(options.driverAccessId);
  }

  if (options.search) {
    const regex = { $regex: options.search, $options: "i" };
    filter.$or = [
      { name: regex },
      { assetNumber: regex },
      { make: regex },
      { model: regex },
      { vin: regex },
      { licensePlate: regex },
    ];
  }

  // Compliance filter is resolved to a fleet-wide asset-id set FIRST, so results
  // are accurate across pagination (not just the loaded page).
  if (options.complianceStatus && options.complianceStatus !== "all") {
    filter._id = await complianceAssetIdClause(
      tenantOid,
      options.complianceStatus,
    );
  }

  const [items, total] = await Promise.all([
    collection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    collection.countDocuments(filter),
  ]);

  // Populate asset type names
  const assetTypeIds = items
    .filter((item) => item.assetTypeId)
    .map((item) => item.assetTypeId as ObjectId);

  let assetTypeMap = new Map<string, Record<string, unknown>>();
  if (assetTypeIds.length > 0) {
    const assetTypesCollection = await getAssetTypesCollection();
    const assetTypes = await assetTypesCollection
      .find({ _id: { $in: assetTypeIds } })
      .toArray();
    assetTypeMap = new Map(assetTypes.map((at) => [at._id.toString(), at]));
  }

  // Populate team names
  const allTeamIds = items
    .flatMap((item) => (Array.isArray(item.teamIds) ? item.teamIds : []))
    .filter((id) => id) as ObjectId[];
  const uniqueTeamIds = [
    ...new Map(allTeamIds.map((id) => [id.toString(), id])).values(),
  ];

  let teamNameMap = new Map<string, string>();
  if (uniqueTeamIds.length > 0) {
    const teamsCollection = await getTeamsCollection();
    const teamDocs = await teamsCollection
      .find({ _id: { $in: uniqueTeamIds } })
      .toArray();
    teamNameMap = new Map(
      teamDocs.map((t) => [t._id.toString(), t.name as string]),
    );
  }

  // Worst-case compliance status per asset (rego/WOF/CoF/RUC/insurance expiry).
  // Bounded to the current page's assets, so this is safe at scale.
  const complianceMap = await computeComplianceStatusMap(
    tenantOid,
    items.map((i) => i._id as ObjectId),
  );

  const serialized = items.map((item) => {
    const assetType = item.assetTypeId
      ? assetTypeMap.get(item.assetTypeId.toString())
      : null;
    const assetTypeName = assetType ? (assetType.name as string) : undefined;

    const teamNames = Array.isArray(item.teamIds)
      ? item.teamIds
          .map((id: ObjectId) => teamNameMap.get(id.toString()))
          .filter(Boolean)
      : [];

    const complianceStatus =
      complianceMap.get((item._id as ObjectId).toString()) || "none";

    return serializeAsset({
      ...item,
      assetTypeName,
      teamNames,
      complianceStatus,
    });
  });

  return {
    items: serialized,
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

/** Fleet-wide summary counts for the asset stat ribbon. */
export async function getAssetSummary(tenantId: string) {
  const collection = await getAssetsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const activeFilter = { tenantId: tenantOid, isArchived: { $ne: true } };

  const [total, inService, outOfService] = await Promise.all([
    collection.countDocuments(activeFilter),
    collection.countDocuments({ ...activeFilter, status: "in_service" }),
    collection.countDocuments({ ...activeFilter, status: "out_of_service" }),
  ]);

  // Count assets with compliance issues (expired or expiring_soon documents)
  const allActiveIds = await collection
    .find(activeFilter, { projection: { _id: 1 } })
    .toArray();
  const complianceMap = await computeComplianceStatusMap(
    tenantOid,
    allActiveIds.map((a) => a._id as ObjectId),
  );
  let nonCompliant = 0;
  for (const status of complianceMap.values()) {
    if (status === "expired" || status === "expiring_soon") nonCompliant++;
  }

  return { total, inService, outOfService, nonCompliant };
}

/**
 * Fleet-wide compliance breakdown for the dashboard donut. Reuses the exact
 * worst-case logic (`computeComplianceStatusMap`) behind the assets list and
 * summary, so counts always match those views. `untracked` = active assets with
 * no expiry-bearing document.
 */
export async function getComplianceBreakdown(tenantId: string) {
  const collection = await getAssetsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const activeFilter = { tenantId: tenantOid, isArchived: { $ne: true } };

  const activeIds = await collection
    .find(activeFilter, { projection: { _id: 1 } })
    .toArray();
  const total = activeIds.length;

  const complianceMap = await computeComplianceStatusMap(
    tenantOid,
    activeIds.map((a) => a._id as ObjectId),
  );

  let valid = 0;
  let expiringSoon = 0;
  let expired = 0;
  for (const status of complianceMap.values()) {
    if (status === "valid") valid++;
    else if (status === "expiring_soon") expiringSoon++;
    else if (status === "expired") expired++;
  }
  // Assets with no tracked (expiry-bearing) document at all.
  const untracked = total - complianceMap.size;

  return { total, valid, expiringSoon, expired, untracked };
}

/** Get a single asset by ID. */
export async function getAssetById(
  tenantId: string,
  assetId: string,
  userId?: string,
) {
  const collection = await getAssetsCollection();
  const query = {
    _id: ObjectId.createFromHexString(assetId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  };
  let doc = await collection.findOne(query);

  if (!doc) return null;

  // Fresh-always: refresh this Command-sourced asset from Command before
  // rendering (single-record, cheap). Awaited so the detail is always current;
  // no-ops when standalone/unreachable. Re-read to pick up the refreshed fields.
  if (doc.source === "command" && doc.commandAssetId) {
    await ensureFreshAsset(tenantId, userId, String(doc.commandAssetId));
    doc = (await collection.findOne(query)) ?? doc;
  }

  // Populate asset type name
  let assetTypeName: string | undefined;
  if (doc.assetTypeId) {
    const assetTypesCollection = await getAssetTypesCollection();
    const assetType = await assetTypesCollection.findOne({
      _id: doc.assetTypeId,
    });
    if (assetType) {
      assetTypeName = assetType.name;
    }
  }

  // Populate form names
  let formNames: string[] = [];
  const docFormIds = Array.isArray(doc.formIds)
    ? (doc.formIds as ObjectId[])
    : [];
  if (docFormIds.length > 0) {
    const formsCollection = await getFormsCollection();
    const forms = await formsCollection
      .find({ _id: { $in: docFormIds } })
      .toArray();
    formNames = forms.map((f) => (f.formTitle as string) || "");
  }

  return serializeAsset({
    ...doc,
    assetTypeName,
    formNames,
  });
}

/** Create a new asset. */
export async function createAsset(
  tenantId: string,
  userId: string,
  input: CreateAssetInput,
) {
  // Connected tenants add assets in Command, then import — never locally.
  if (await isCommandConnectionEnabled(tenantId)) {
    return { data: null, error: MASTER_DATA_MANAGED_MESSAGE };
  }

  const validation = validateCreateAssetInput(input);
  if (!validation.valid) {
    return { data: null, error: validation.errors };
  }

  const collection = await getAssetsCollection();
  const now = new Date();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);

  const doc = {
    tenantId: tenantOid,
    name: input.name.trim(),
    assetNumber: input.assetNumber?.trim() || undefined,
    status: input.status || "in_service",

    // Manufacturer details
    vin: input.vin?.trim() || undefined,
    licensePlate: input.licensePlate?.trim() || undefined,
    make: input.make?.trim() || undefined,
    model: input.model?.trim() || undefined,
    year: input.year || undefined,
    color: input.color?.trim() || undefined,
    tireSize: input.tireSize?.trim() || undefined,
    notes: input.notes?.trim() || undefined,

    // Other details
    teamIds: input.teamIds?.map((id) => ObjectId.createFromHexString(id)) || [],
    currentOdometer: input.currentOdometer ?? undefined,
    currentEngineHours: input.currentEngineHours ?? undefined,
    estimatedCost: input.estimatedCost ?? undefined,
    currencyCode: input.currencyCode || "USD",
    assetTypeId: input.assetTypeId
      ? ObjectId.createFromHexString(input.assetTypeId)
      : undefined,
    subscriptionType: input.subscriptionType || undefined,
    lastServiceDate: input.lastServiceDate
      ? new Date(input.lastServiceDate)
      : undefined,
    lastServiceMileage: input.lastServiceMileage ?? undefined,
    lastServiceEngineHours: input.lastServiceEngineHours ?? undefined,
    hubometer: input.hubometer ?? undefined,
    regoWof: input.regoWof ? new Date(input.regoWof) : undefined,

    type: input.type?.trim() || undefined,
    fuelType: input.fuelType || undefined,
    primaryMeter: input.primaryMeter || "odometer",
    photoUrls: input.photoUrls || [],
    formIds: (input.formIds || []).map((id) =>
      ObjectId.createFromHexString(id),
    ),
    servicePlanId:
      input.servicePlanId && ObjectId.isValid(input.servicePlanId)
        ? ObjectId.createFromHexString(input.servicePlanId)
        : null,
    assetGroupIds: [],
    driverAccessIds: (input.driverAccessIds || []).map((id) =>
      ObjectId.createFromHexString(id),
    ),

    // Base fields
    createdBy: userOid,
    updatedBy: userOid,
    createdAt: now,
    updatedAt: now,
    isActive: true,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  };

  const result = await collection.insertOne(doc);
  return {
    data: serializeAsset({ ...doc, _id: result.insertedId }),
    error: null,
  };
}

/** Update an existing asset. */
export async function updateAsset(
  tenantId: string,
  userId: string,
  assetId: string,
  input: UpdateAssetInput,
) {
  const collection = await getAssetsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const assetOid = ObjectId.createFromHexString(assetId);

  const existing = await collection.findOne({
    _id: assetOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });
  if (!existing) return { data: null, error: "Asset not found" };

  // Command-sourced assets: identity fields are owned by Command — strip them
  // from local edits (operational fields like status/teams/programs still save).
  if (existing.source === "command") {
    const guarded = stripCommandOwnedFields(
      input as Record<string, unknown>,
      "assets",
    );
    input = guarded.input as UpdateAssetInput;
    if (guarded.stripped.length > 0) {
      console.warn(
        `[assets] Ignored Command-owned field edit on ${assetId}: ${guarded.stripped.join(", ")}`,
      );
    }
  }

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  // Apply fields
  if (input.name !== undefined) $set.name = input.name.trim();
  if (input.assetNumber !== undefined)
    $set.assetNumber = input.assetNumber.trim();
  if (input.status !== undefined) $set.status = input.status;
  if (input.vin !== undefined) $set.vin = input.vin.trim();
  if (input.licensePlate !== undefined)
    $set.licensePlate = input.licensePlate.trim();
  if (input.make !== undefined) $set.make = input.make.trim();
  if (input.model !== undefined) $set.model = input.model.trim();
  if (input.year !== undefined) $set.year = input.year;
  if (input.color !== undefined) $set.color = input.color.trim();
  if (input.tireSize !== undefined) $set.tireSize = input.tireSize.trim();
  if (input.notes !== undefined) $set.notes = input.notes.trim();
  if (input.teamIds !== undefined)
    $set.teamIds = input.teamIds.map((id) => ObjectId.createFromHexString(id));
  if (input.currentOdometer !== undefined)
    $set.currentOdometer = input.currentOdometer;
  if (input.currentEngineHours !== undefined)
    $set.currentEngineHours = input.currentEngineHours;
  if (input.estimatedCost !== undefined)
    $set.estimatedCost = input.estimatedCost;
  if (input.currencyCode !== undefined) $set.currencyCode = input.currencyCode;
  if (input.assetTypeId !== undefined)
    $set.assetTypeId = input.assetTypeId
      ? ObjectId.createFromHexString(input.assetTypeId)
      : null;
  if (input.subscriptionType !== undefined)
    $set.subscriptionType = input.subscriptionType;
  if (input.lastServiceDate !== undefined)
    $set.lastServiceDate = input.lastServiceDate
      ? new Date(input.lastServiceDate)
      : null;
  if (input.lastServiceMileage !== undefined)
    $set.lastServiceMileage = input.lastServiceMileage;
  if (input.lastServiceEngineHours !== undefined)
    $set.lastServiceEngineHours = input.lastServiceEngineHours;
  if (input.hubometer !== undefined) $set.hubometer = input.hubometer;
  if (input.regoWof !== undefined)
    $set.regoWof = input.regoWof ? new Date(input.regoWof) : null;
  if (input.type !== undefined) $set.type = input.type.trim();
  if (input.fuelType !== undefined) $set.fuelType = input.fuelType;
  if (input.primaryMeter !== undefined) $set.primaryMeter = input.primaryMeter;
  if (input.photoUrls !== undefined) $set.photoUrls = input.photoUrls;
  if (input.formIds !== undefined)
    $set.formIds = input.formIds.map((id) => ObjectId.createFromHexString(id));
  if (input.servicePlanId !== undefined)
    $set.servicePlanId =
      input.servicePlanId && ObjectId.isValid(input.servicePlanId)
        ? ObjectId.createFromHexString(input.servicePlanId)
        : null;
  if (input.driverAccessIds !== undefined)
    $set.driverAccessIds = input.driverAccessIds.map((id) =>
      ObjectId.createFromHexString(id),
    );

  await collection.updateOne({ _id: assetOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: assetOid });

  // Command-linked assets: mirror a manual in/out-of-service toggle to Command.
  if (input.status !== undefined && input.status !== existing.status) {
    await writebackAvailabilityIfLinked(
      tenantId,
      assetOid,
      input.status === "out_of_service",
      "Status changed in Drive",
    );
  }

  return { data: updated ? serializeAsset(updated) : null, error: null };
}

/** Permanently delete an asset. */
export async function deleteAsset(
  tenantId: string,
  userId: string,
  assetId: string,
) {
  const collection = await getAssetsCollection();
  const result = await collection.updateOne(
    {
      _id: ObjectId.createFromHexString(assetId),
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

/** Bulk-add a team to multiple assets. */
export async function addTeamToAssets(
  tenantId: string,
  userId: string,
  teamId: string,
  assetIds: string[],
) {
  const collection = await getAssetsCollection();
  const teamsCollection = await getTeamsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const teamOid = ObjectId.createFromHexString(teamId);
  const userOid = ObjectId.createFromHexString(userId);
  const assetOids = assetIds.map((id) => ObjectId.createFromHexString(id));

  // Add teamId to each asset's teamIds array
  const result = await collection.updateMany(
    {
      _id: { $in: assetOids },
      tenantId: tenantOid,
      isArchived: { $ne: true },
    },
    {
      $addToSet: { teamIds: teamOid },
      $set: { updatedBy: userOid, updatedAt: new Date() },
    },
  );

  // Add assetIds to the team's assetIds array
  await teamsCollection.updateOne(
    { _id: teamOid, tenantId: tenantOid, isArchived: { $ne: true } },
    {
      $addToSet: { assetIds: { $each: assetOids } },
      $set: { updatedBy: userOid, updatedAt: new Date() },
    },
  );

  return result.modifiedCount;
}

/** Remove a team from an asset. */
export async function removeTeamFromAsset(
  tenantId: string,
  userId: string,
  teamId: string,
  assetId: string,
) {
  const collection = await getAssetsCollection();
  const teamsCollection = await getTeamsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const teamOid = ObjectId.createFromHexString(teamId);
  const assetOid = ObjectId.createFromHexString(assetId);
  const userOid = ObjectId.createFromHexString(userId);

  // Remove teamId from the asset's teamIds array
  const result = await collection.updateOne(
    {
      _id: assetOid,
      tenantId: tenantOid,
      isArchived: { $ne: true },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {
      $pull: { teamIds: teamOid },
      $set: { updatedBy: userOid, updatedAt: new Date() },
    } as any,
  );

  // Remove assetId from the team's assetIds array
  await teamsCollection.updateOne(
    { _id: teamOid, tenantId: tenantOid, isArchived: { $ne: true } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {
      $pull: { assetIds: assetOid },
      $set: { updatedBy: userOid, updatedAt: new Date() },
    } as any,
  );

  return result.modifiedCount > 0;
}
