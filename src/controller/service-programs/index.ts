/**
 * Service Program controller -- CRUD business logic for servicePrograms collection.
 * MongoDB native driver, no Mongoose/ODM.
 */
import { ObjectId } from 'mongodb';
import { getServiceProgramsCollection } from '@/lib/mongodb';
import { validateCreateServiceProgramInput, serializeServiceProgram } from './utils';
import type { CreateServiceProgramInput, UpdateServiceProgramInput } from './types';

/** List service programs with pagination, search, and optional category filter. */
export async function getAllServicePrograms(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; category?: string },
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
    filter.$or = [
      { title: regex },
      { description: regex },
    ];
  }

  if (options.category) {
    filter.category = options.category;
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
    description: input.description?.trim() || undefined,
    category: input.category || 'scheduled_maintenance',
    serviceTaskIds: (input.serviceTaskIds || []).map((id) => ObjectId.createFromHexString(id)),
    triggers: (input.triggers || []).map((t) => ({
      triggerType: t.triggerType,
      intervalType: t.intervalType,
      interval: t.interval,
      timeUnit: t.timeUnit || undefined,
      reminderThreshold: t.reminderThreshold ?? undefined,
    })),

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

  if (input.description !== undefined) $set.description = input.description?.trim() || undefined;
  if (input.category !== undefined) $set.category = input.category;
  if (input.serviceTaskIds !== undefined) {
    $set.serviceTaskIds = (input.serviceTaskIds || []).map((id) => ObjectId.createFromHexString(id));
  }
  if (input.triggers !== undefined) {
    $set.triggers = (input.triggers || []).map((t) => ({
      triggerType: t.triggerType,
      intervalType: t.intervalType,
      interval: t.interval,
      timeUnit: t.timeUnit || undefined,
      reminderThreshold: t.reminderThreshold ?? undefined,
    }));
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
    description: original.description || undefined,
    category: original.category,
    serviceTaskIds: original.serviceTaskIds || [],
    triggers: original.triggers || [],

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
