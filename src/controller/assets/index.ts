/**
 * Asset controller — CRUD business logic for assets collection.
 * MongoDB native driver, no Mongoose/ODM.
 */
import { ObjectId } from 'mongodb';
import { getAssetsCollection, getAssetTypesCollection, getTeamsCollection, getFormsCollection, getServiceProgramsCollection } from '@/lib/mongodb';
import { validateCreateAssetInput, serializeAsset } from './utils';
import type { CreateAssetInput, UpdateAssetInput } from './types';

/** List assets with pagination, filtering, and search. */
export async function getAllAssets(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; status?: string; teamId?: string },
) {
  const collection = await getAssetsCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  };

  if (options.status) {
    filter.status = options.status;
  }

  if (options.teamId) {
    filter.teamIds = ObjectId.createFromHexString(options.teamId);
  }

  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    filter.$or = [
      { name: regex },
      { assetNumber: regex },
      { make: regex },
      { model: regex },
      { vin: regex },
      { licensePlate: regex },
    ];
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  // Populate asset type names
  const assetTypeIds = items
    .filter((item) => item.assetTypeId)
    .map((item) => item.assetTypeId as ObjectId);

  let assetTypeMap = new Map<string, Record<string, unknown>>();
  if (assetTypeIds.length > 0) {
    const assetTypesCollection = await getAssetTypesCollection();
    const assetTypes = await assetTypesCollection.find({ _id: { $in: assetTypeIds } }).toArray();
    assetTypeMap = new Map(assetTypes.map((at) => [at._id.toString(), at]));
  }

  // Populate team names
  const allTeamIds = items
    .flatMap((item) => (Array.isArray(item.teamIds) ? item.teamIds : []))
    .filter((id) => id) as ObjectId[];
  const uniqueTeamIds = [...new Map(allTeamIds.map((id) => [id.toString(), id])).values()];

  let teamNameMap = new Map<string, string>();
  if (uniqueTeamIds.length > 0) {
    const teamsCollection = await getTeamsCollection();
    const teamDocs = await teamsCollection.find({ _id: { $in: uniqueTeamIds } }).toArray();
    teamNameMap = new Map(teamDocs.map((t) => [t._id.toString(), t.name as string]));
  }

  const serialized = items.map((item) => {
    const assetType = item.assetTypeId ? assetTypeMap.get(item.assetTypeId.toString()) : null;
    const assetTypeName = assetType ? (assetType.name as string) : undefined;

    const teamNames = Array.isArray(item.teamIds)
      ? item.teamIds.map((id: ObjectId) => teamNameMap.get(id.toString())).filter(Boolean)
      : [];

    return serializeAsset({ ...item, assetTypeName, teamNames });
  });

  return {
    items: serialized,
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

/** Get a single asset by ID. */
export async function getAssetById(tenantId: string, assetId: string) {
  const collection = await getAssetsCollection();
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(assetId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });

  if (!doc) return null;

  // Populate asset type name
  let assetTypeName: string | undefined;
  if (doc.assetTypeId) {
    const assetTypesCollection = await getAssetTypesCollection();
    const assetType = await assetTypesCollection.findOne({ _id: doc.assetTypeId });
    if (assetType) {
      assetTypeName = assetType.name;
    }
  }

  // Populate form names
  let formNames: string[] = [];
  const docFormIds = Array.isArray(doc.formIds) ? (doc.formIds as ObjectId[]) : [];
  if (docFormIds.length > 0) {
    const formsCollection = await getFormsCollection();
    const forms = await formsCollection.find({ _id: { $in: docFormIds } }).toArray();
    formNames = forms.map((f) => (f.formTitle as string) || '');
  }

  // Populate service program names
  let serviceProgramNames: string[] = [];
  const docSpIds = Array.isArray(doc.serviceProgramIds) ? (doc.serviceProgramIds as ObjectId[]) : [];
  if (docSpIds.length > 0) {
    const spCollection = await getServiceProgramsCollection();
    const programs = await spCollection.find({ _id: { $in: docSpIds } }).toArray();
    serviceProgramNames = programs.map((p) => (p.title as string) || '');
  }

  return serializeAsset({ ...doc, assetTypeName, formNames, serviceProgramNames });
}

/** Create a new asset. */
export async function createAsset(tenantId: string, userId: string, input: CreateAssetInput) {
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
    status: input.status || 'in_service',

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
    assetSubtype: input.assetSubtype?.trim() || undefined,
    teamIds: input.teamIds?.map((id) => ObjectId.createFromHexString(id)) || [],
    currentOdometer: input.currentOdometer ?? undefined,
    currentEngineHours: input.currentEngineHours ?? undefined,
    estimatedCost: input.estimatedCost ?? undefined,
    currencyCode: input.currencyCode || 'USD',
    assetTypeId: input.assetTypeId ? ObjectId.createFromHexString(input.assetTypeId) : undefined,
    subscriptionType: input.subscriptionType || undefined,
    lastServiceDate: input.lastServiceDate ? new Date(input.lastServiceDate) : undefined,
    lastServiceMileage: input.lastServiceMileage ?? undefined,
    lastServiceEngineHours: input.lastServiceEngineHours ?? undefined,
    hubometer: input.hubometer ?? undefined,
    regoWof: input.regoWof ? new Date(input.regoWof) : undefined,

    type: input.type?.trim() || undefined,
    fuelType: input.fuelType || undefined,
    primaryMeter: input.primaryMeter || 'odometer',
    photoUrls: input.photoUrls || [],
    formIds: (input.formIds || []).map((id) => ObjectId.createFromHexString(id)),
    serviceProgramIds: (input.serviceProgramIds || []).map((id) => ObjectId.createFromHexString(id)),
    assetGroupIds: [],
    driverAccessIds: (input.driverAccessIds || []).map((id) => ObjectId.createFromHexString(id)),

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
  if (!existing) return { data: null, error: 'Asset not found' };

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  // Apply fields
  if (input.name !== undefined) $set.name = input.name.trim();
  if (input.assetNumber !== undefined) $set.assetNumber = input.assetNumber.trim();
  if (input.status !== undefined) $set.status = input.status;
  if (input.assetSubtype !== undefined) $set.assetSubtype = input.assetSubtype.trim();
  if (input.vin !== undefined) $set.vin = input.vin.trim();
  if (input.licensePlate !== undefined) $set.licensePlate = input.licensePlate.trim();
  if (input.make !== undefined) $set.make = input.make.trim();
  if (input.model !== undefined) $set.model = input.model.trim();
  if (input.year !== undefined) $set.year = input.year;
  if (input.color !== undefined) $set.color = input.color.trim();
  if (input.tireSize !== undefined) $set.tireSize = input.tireSize.trim();
  if (input.notes !== undefined) $set.notes = input.notes.trim();
  if (input.teamIds !== undefined) $set.teamIds = input.teamIds.map((id) => ObjectId.createFromHexString(id));
  if (input.currentOdometer !== undefined) $set.currentOdometer = input.currentOdometer;
  if (input.currentEngineHours !== undefined) $set.currentEngineHours = input.currentEngineHours;
  if (input.estimatedCost !== undefined) $set.estimatedCost = input.estimatedCost;
  if (input.currencyCode !== undefined) $set.currencyCode = input.currencyCode;
  if (input.assetTypeId !== undefined) $set.assetTypeId = input.assetTypeId ? ObjectId.createFromHexString(input.assetTypeId) : null;
  if (input.subscriptionType !== undefined) $set.subscriptionType = input.subscriptionType;
  if (input.lastServiceDate !== undefined) $set.lastServiceDate = input.lastServiceDate ? new Date(input.lastServiceDate) : null;
  if (input.lastServiceMileage !== undefined) $set.lastServiceMileage = input.lastServiceMileage;
  if (input.lastServiceEngineHours !== undefined) $set.lastServiceEngineHours = input.lastServiceEngineHours;
  if (input.hubometer !== undefined) $set.hubometer = input.hubometer;
  if (input.regoWof !== undefined) $set.regoWof = input.regoWof ? new Date(input.regoWof) : null;
  if (input.type !== undefined) $set.type = input.type.trim();
  if (input.fuelType !== undefined) $set.fuelType = input.fuelType;
  if (input.primaryMeter !== undefined) $set.primaryMeter = input.primaryMeter;
  if (input.photoUrls !== undefined) $set.photoUrls = input.photoUrls;
  if (input.formIds !== undefined) $set.formIds = input.formIds.map((id) => ObjectId.createFromHexString(id));
  if (input.serviceProgramIds !== undefined) $set.serviceProgramIds = input.serviceProgramIds.map((id) => ObjectId.createFromHexString(id));
  if (input.driverAccessIds !== undefined) $set.driverAccessIds = input.driverAccessIds.map((id) => ObjectId.createFromHexString(id));

  await collection.updateOne({ _id: assetOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: assetOid });

  return { data: updated ? serializeAsset(updated) : null, error: null };
}

/** Archive (soft-delete) an asset. */
export async function deleteAsset(tenantId: string, userId: string, assetId: string) {
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
