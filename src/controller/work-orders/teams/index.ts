/**
 * Team controller -- CRUD business logic for teams collection.
 * MongoDB native driver, no Mongoose/ODM.
 */
import { ObjectId } from 'mongodb';
import { getTeamsCollection, getAssetsCollection } from '@/lib/mongodb';
import { validateCreateTeamInput, serializeTeam } from './utils';
import type { CreateTeamInput, UpdateTeamInput } from './types';

/** List teams with pagination and search. */
export async function getAllTeams(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; showArchived?: boolean; createdBy?: string; teamIds?: string[] },
) {
  const collection = await getTeamsCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
  };

  // "OWN" view scope — only show records created by this user
  if (options.createdBy) {
    filter.createdBy = ObjectId.createFromHexString(options.createdBy);
  }

  // Team-scoped roles: only the teams the caller belongs to.
  if (options.teamIds) {
    filter._id = {
      $in: options.teamIds.filter((id) => ObjectId.isValid(id)).map((id) => ObjectId.createFromHexString(id)),
    };
  }

  if (options.showArchived) {
    filter.isArchived = true;
  } else {
    filter.isArchived = { $ne: true };
  }

  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    filter.name = regex;
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  // Count assets per team
  const assetsCollection = await getAssetsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const teamIds = items.map((item) => item._id);

  const assetCounts = teamIds.length > 0
    ? await assetsCollection
        .aggregate([
          {
            $match: {
              tenantId: tenantOid,
              isArchived: { $ne: true },
              teamIds: { $in: teamIds },
            },
          },
          { $unwind: '$teamIds' },
          { $match: { teamIds: { $in: teamIds } } },
          { $group: { _id: '$teamIds', count: { $sum: 1 } } },
        ])
        .toArray()
    : [];

  const assetCountMap = new Map(
    assetCounts.map((ac) => [ac._id.toString(), ac.count as number]),
  );

  const serialized = items.map((item) =>
    serializeTeam(item, {
      assetCount: assetCountMap.get(item._id.toString()) || 0,
      driverCount: 0,
    }),
  );

  return {
    items: serialized,
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

/** Get a single team by ID. */
export async function getTeamById(tenantId: string, teamId: string) {
  const collection = await getTeamsCollection();
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(teamId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });

  if (!doc) return null;

  // Count assets for this team
  const assetsCollection = await getAssetsCollection();
  const assetCount = await assetsCollection.countDocuments({
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
    teamIds: doc._id,
  });

  return serializeTeam(doc, { assetCount, driverCount: 0 });
}

/** Create a new team. */
export async function createTeam(tenantId: string, userId: string, input: CreateTeamInput) {
  const validation = validateCreateTeamInput(input);
  if (!validation.valid) {
    return { data: null, error: validation.errors };
  }

  const collection = await getTeamsCollection();
  const now = new Date();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);

  // Check for duplicate name in tenant
  const existing = await collection.findOne({
    tenantId: tenantOid,
    nameLower: input.name.trim().toLowerCase(),
    isArchived: { $ne: true },
  });
  if (existing) {
    return { data: null, error: { name: 'A team with this name already exists' } };
  }

  const doc = {
    tenantId: tenantOid,
    name: input.name.trim(),
    nameLower: input.name.trim().toLowerCase(),
    assetIds: [] as ObjectId[],

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
    data: serializeTeam({ ...doc, _id: result.insertedId }),
    error: null,
  };
}

/** Update an existing team. */
export async function updateTeam(
  tenantId: string,
  userId: string,
  teamId: string,
  input: UpdateTeamInput,
) {
  const collection = await getTeamsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const teamOid = ObjectId.createFromHexString(teamId);

  const existing = await collection.findOne({
    _id: teamOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });
  if (!existing) return { data: null, error: 'Team not found' };

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) return { data: null, error: { name: 'Team name is required' } };
    if (trimmed.length > 100) return { data: null, error: { name: 'Team name must be at most 100 characters' } };

    // Check for duplicate name
    const duplicate = await collection.findOne({
      tenantId: tenantOid,
      nameLower: trimmed.toLowerCase(),
      _id: { $ne: teamOid },
      isArchived: { $ne: true },
    });
    if (duplicate) {
      return { data: null, error: { name: 'A team with this name already exists' } };
    }

    $set.name = trimmed;
    $set.nameLower = trimmed.toLowerCase();
  }

  await collection.updateOne({ _id: teamOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: teamOid });

  return { data: updated ? serializeTeam(updated) : null, error: null };
}

/** Permanently delete a team. */
export async function deleteTeam(tenantId: string, userId: string, teamId: string) {
  const collection = await getTeamsCollection();
  const docOid = ObjectId.createFromHexString(teamId);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const result = await collection.deleteOne({ _id: docOid, tenantId: tenantOid });
  return result.deletedCount > 0;
}
