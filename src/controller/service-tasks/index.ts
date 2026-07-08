/**
 * Service Task controller -- CRUD business logic for serviceTasks collection.
 * MongoDB native driver, no Mongoose/ODM.
 */
import { ObjectId } from 'mongodb';
import { getServiceTasksCollection } from '@/lib/mongodb';
import { validateCreateServiceTaskInput, serializeServiceTask } from './utils';
import type { CreateServiceTaskInput, UpdateServiceTaskInput } from './types';

/** List service tasks with pagination and search. */
export async function getAllServiceTasks(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; showArchived?: boolean; createdBy?: string },
) {
  const collection = await getServiceTasksCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
  };

  if (options.createdBy) {
    filter.createdBy = ObjectId.createFromHexString(options.createdBy);
  }

  if (options.showArchived) {
    filter.isArchived = true;
  } else {
    filter.isArchived = { $ne: true };
  }

  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    filter.$or = [
      { title: regex },
      { description: regex },
    ];
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => serializeServiceTask(item)),
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

/** Get a single service task by ID. */
export async function getServiceTaskById(tenantId: string, taskId: string) {
  const collection = await getServiceTasksCollection();
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(taskId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });

  if (!doc) return null;
  return serializeServiceTask(doc);
}

/** Create a new service task. */
export async function createServiceTask(tenantId: string, userId: string, input: CreateServiceTaskInput) {
  const validation = validateCreateServiceTaskInput(input);
  if (!validation.valid) {
    return { data: null, error: validation.errors };
  }

  const collection = await getServiceTasksCollection();
  const now = new Date();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    laborCost: input.laborCost ?? undefined,
    partsCost: input.partsCost ?? undefined,
    totalCost: input.totalCost ?? undefined,

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
    data: serializeServiceTask({ ...doc, _id: result.insertedId }),
    error: null,
  };
}

/** Update an existing service task. */
export async function updateServiceTask(
  tenantId: string,
  userId: string,
  taskId: string,
  input: UpdateServiceTaskInput,
) {
  const collection = await getServiceTasksCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const taskOid = ObjectId.createFromHexString(taskId);

  const existing = await collection.findOne({
    _id: taskOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });
  if (!existing) return { data: null, error: 'Service task not found' };

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
  if (input.laborCost !== undefined) $set.laborCost = input.laborCost ?? undefined;
  if (input.partsCost !== undefined) $set.partsCost = input.partsCost ?? undefined;
  if (input.totalCost !== undefined) $set.totalCost = input.totalCost ?? undefined;

  await collection.updateOne({ _id: taskOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: taskOid });

  return { data: updated ? serializeServiceTask(updated) : null, error: null };
}

/** Permanently delete a service task. */
export async function deleteServiceTask(tenantId: string, userId: string, taskId: string) {
  const collection = await getServiceTasksCollection();
  const docOid = ObjectId.createFromHexString(taskId);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const result = await collection.deleteOne({ _id: docOid, tenantId: tenantOid });
  return result.deletedCount > 0;
}
