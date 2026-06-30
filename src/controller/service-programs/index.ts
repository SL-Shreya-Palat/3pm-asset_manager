/**
 * Service Program controller -- CRUD business logic for servicePrograms collection.
 * MongoDB native driver, no Mongoose/ODM.
 */
import { ObjectId } from 'mongodb';
import { getServiceProgramsCollection } from '@/lib/mongodb';
import { validateCreateServiceProgramInput, serializeServiceProgram } from './utils';
import type { CreateServiceProgramInput, UpdateServiceProgramInput } from './types';

/** List service programs with pagination, search. */
export async function getAllServicePrograms(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string },
) {
  const collection = await getServiceProgramsCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  };

  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    filter.$or = [{ title: regex }];
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => serializeServiceProgram(item)),
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

/** Get a single service program by ID. */
export async function getServiceProgramById(tenantId: string, programId: string) {
  const collection = await getServiceProgramsCollection();
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(programId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });

  if (!doc) return null;
  return serializeServiceProgram(doc);
}

/** Build the interval sub-document from input. */
function buildIntervalDoc(input: CreateServiceProgramInput['interval']) {
  if (!input) return { type: 'repeat' };
  const doc: Record<string, unknown> = { type: input.type || 'repeat' };

  if (input.type === 'repeat') {
    if (input.mileage) doc.mileage = { enabled: !!input.mileage.enabled, every: input.mileage.every || 0 };
    if (input.engineHours) doc.engineHours = { enabled: !!input.engineHours.enabled, every: input.engineHours.every || 0 };
    if (input.calendar) doc.calendar = { enabled: !!input.calendar.enabled, every: input.calendar.every || 0, unit: input.calendar.unit || 'day' };

    if (input.ends) {
      const ends: Record<string, unknown> = { type: input.ends.type || 'never' };
      if (input.ends.type === 'on' && input.ends.date) ends.date = new Date(input.ends.date);
      if (input.ends.type === 'after' && input.ends.occurrences) ends.occurrences = input.ends.occurrences;
      doc.ends = ends;
    }
  }

  if (input.type === 'one_time') {
    if (input.dueMileage) doc.dueMileage = { enabled: !!input.dueMileage.enabled, mode: input.dueMileage.mode || 'at', value: input.dueMileage.value || 0 };
    if (input.dueEngineHours) doc.dueEngineHours = { enabled: !!input.dueEngineHours.enabled, mode: input.dueEngineHours.mode || 'at', value: input.dueEngineHours.value || 0 };
    if (input.dueOnDate) doc.dueOnDate = { enabled: !!input.dueOnDate.enabled, date: input.dueOnDate.date ? new Date(input.dueOnDate.date) : undefined };
  }

  return doc;
}

/** Build the reminders sub-document from input. */
function buildRemindersDoc(input: CreateServiceProgramInput['reminders']) {
  if (!input) return { autoCreateWorkOrder: false, channels: [], recipientSelf: false };
  const doc: Record<string, unknown> = {
    autoCreateWorkOrder: input.autoCreateWorkOrder ?? false,
    channels: input.channels || [],
    recipientSelf: input.recipientSelf ?? false,
  };
  if (input.thresholdMileage) doc.thresholdMileage = { enabled: !!input.thresholdMileage.enabled, value: input.thresholdMileage.value || 0 };
  if (input.thresholdEngineHours) doc.thresholdEngineHours = { enabled: !!input.thresholdEngineHours.enabled, value: input.thresholdEngineHours.value || 0 };
  if (input.thresholdCalendar) doc.thresholdCalendar = { enabled: !!input.thresholdCalendar.enabled, value: input.thresholdCalendar.value || 0, unit: input.thresholdCalendar.unit || 'day' };
  if (input.autoCreateWorkOrder && input.mechanicId) {
    doc.mechanicId = ObjectId.createFromHexString(input.mechanicId);
  }
  return doc;
}

/** Create a new service program. */
export async function createServiceProgram(
  tenantId: string,
  userId: string,
  input: CreateServiceProgramInput,
) {
  const validation = validateCreateServiceProgramInput(input);
  if (!validation.valid) {
    return { data: null, error: validation.errors };
  }

  const collection = await getServiceProgramsCollection();
  const now = new Date();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    title: input.title.trim(),
    serviceTaskIds: (input.serviceTaskIds || []).map((id) => ObjectId.createFromHexString(id)),
    interval: buildIntervalDoc(input.interval),
    assetIds: (input.assetIds || []).map((id) => ObjectId.createFromHexString(id)),
    reminders: buildRemindersDoc(input.reminders),

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
    data: serializeServiceProgram({ ...doc, _id: result.insertedId }),
    error: null,
  };
}

/** Update an existing service program. */
export async function updateServiceProgram(
  tenantId: string,
  userId: string,
  programId: string,
  input: UpdateServiceProgramInput,
) {
  const collection = await getServiceProgramsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const programOid = ObjectId.createFromHexString(programId);

  const existing = await collection.findOne({
    _id: programOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });
  if (!existing) return { data: null, error: 'Service program not found' };

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  if (input.title !== undefined) {
    const trimmed = input.title.trim();
    if (!trimmed) return { data: null, error: { title: 'Title is required' } };
    if (trimmed.length > 160) return { data: null, error: { title: 'Title must be at most 160 characters' } };
    $set.title = trimmed;
  }

  if (input.serviceTaskIds !== undefined) {
    $set.serviceTaskIds = (input.serviceTaskIds || []).map((id) => ObjectId.createFromHexString(id));
  }

  if (input.interval !== undefined) {
    $set.interval = buildIntervalDoc(input.interval);
  }

  if (input.assetIds !== undefined) {
    $set.assetIds = (input.assetIds || []).map((id) => ObjectId.createFromHexString(id));
  }

  if (input.reminders !== undefined) {
    $set.reminders = buildRemindersDoc(input.reminders);
  }

  await collection.updateOne({ _id: programOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: programOid });

  return { data: updated ? serializeServiceProgram(updated) : null, error: null };
}

/** Archive (soft-delete) a service program. */
export async function deleteServiceProgram(tenantId: string, userId: string, programId: string) {
  const collection = await getServiceProgramsCollection();
  const programOid = ObjectId.createFromHexString(programId);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const now = new Date();
  const userOid = ObjectId.createFromHexString(userId);

  const result = await collection.updateOne(
    { _id: programOid, tenantId: tenantOid, isArchived: { $ne: true } },
    {
      $set: {
        isArchived: true,
        archivedAt: now,
        archivedBy: userOid,
        updatedBy: userOid,
        updatedAt: now,
      },
    },
  );

  return result.modifiedCount > 0;
}

/** Duplicate a service program (create a copy). */
export async function duplicateServiceProgram(tenantId: string, userId: string, programId: string) {
  const collection = await getServiceProgramsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const programOid = ObjectId.createFromHexString(programId);

  const original = await collection.findOne({
    _id: programOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });
  if (!original) return { data: null, error: 'Service program not found' };

  const now = new Date();
  const userOid = ObjectId.createFromHexString(userId);

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    title: `${original.title} (Copy)`,
    serviceTaskIds: original.serviceTaskIds || [],
    interval: original.interval || { type: 'repeat' },
    assetIds: original.assetIds || [],
    reminders: original.reminders || { autoCreateWorkOrder: false, channels: [], recipientSelf: false },

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
    data: serializeServiceProgram({ ...doc, _id: result.insertedId }),
    error: null,
  };
}
