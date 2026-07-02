/**
 * Driver Wellness controller — CRUD + summary aggregation for
 * the driverWellnessChecks collection.
 */
import { ObjectId } from 'mongodb';
import { getDriverWellnessChecksCollection, getDriversCollection } from '@/lib/mongodb';
import { validateCreateWellnessCheckInput, serializeWellnessCheck, computeWellnessResult } from './utils';
import type { CreateWellnessCheckInput, DriverWellnessSummary } from './types';

/** Today's date range (start of day → start of tomorrow) in UTC. */
function todayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/** Summary stats for the dashboard stat cards. */
export async function getDriverWellnessSummary(tenantId: string): Promise<DriverWellnessSummary> {
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const { start, end } = todayRange();

  const [driversCol, checksCol] = await Promise.all([
    getDriversCollection(),
    getDriverWellnessChecksCollection(),
  ]);

  const [totalDrivers, todayChecks] = await Promise.all([
    driversCol.countDocuments({ tenantId: tenantOid, isArchived: { $ne: true } }),
    checksCol
      .find({
        tenantId: tenantOid,
        isArchived: { $ne: true },
        submittedAt: { $gte: start, $lt: end },
      })
      .toArray(),
  ]);

  const driverIdsToday = new Set(todayChecks.map((c) => c.driverId.toString()));
  const passedToday = todayChecks.filter((c) => c.result === 'pass').length;
  const failedToday = todayChecks.filter((c) => c.result === 'fail').length;

  return {
    totalDrivers,
    checkedToday: driverIdsToday.size,
    passedToday,
    failedToday,
  };
}

/** List wellness checks with pagination, search, and result filter. */
export async function getAllWellnessChecks(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; result?: string },
) {
  const collection = await getDriverWellnessChecksCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  };

  if (options.search) {
    filter.driverName = { $regex: options.search, $options: 'i' };
  }

  if (options.result === 'pass' || options.result === 'fail') {
    filter.result = options.result;
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => serializeWellnessCheck(item)),
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

/** Get a single wellness check by ID. */
export async function getWellnessCheckById(tenantId: string, checkId: string) {
  const collection = await getDriverWellnessChecksCollection();
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(checkId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });

  if (!doc) return null;
  return serializeWellnessCheck(doc);
}

/** Create a new wellness check. */
export async function createWellnessCheck(
  tenantId: string,
  userId: string,
  input: CreateWellnessCheckInput,
) {
  const validation = validateCreateWellnessCheckInput(input);
  if (!validation.valid) {
    return { data: null, error: validation.errors };
  }

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const driverOid = ObjectId.createFromHexString(input.driverId);
  const userOid = ObjectId.createFromHexString(userId);
  const now = new Date();

  // Resolve driver name for denormalization
  const driversCol = await getDriversCollection();
  const driver = await driversCol.findOne({
    _id: driverOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });

  if (!driver) {
    return { data: null, error: 'Driver not found' };
  }

  const driverName = `${driver.firstName} ${driver.lastName}`.trim();
  const result = computeWellnessResult(input);

  const doc = {
    tenantId: tenantOid,
    driverId: driverOid,
    driverName,
    fitToWork: input.fitToWork,
    freeOfFatigue: input.freeOfFatigue,
    freeOfSubstances: input.freeOfSubstances,
    noImpairingCondition: input.noImpairingCondition,
    hoursOfSleep: input.hoursOfSleep ?? null,
    comments: input.comments?.trim() || null,
    signatureUrl: input.signatureUrl || null,
    result,
    submittedAt: now,
    createdBy: userOid,
    createdAt: now,
    isArchived: false,
  };

  const insertResult = await (await getDriverWellnessChecksCollection()).insertOne(doc);

  return {
    data: serializeWellnessCheck({ ...doc, _id: insertResult.insertedId }),
    error: null,
  };
}
