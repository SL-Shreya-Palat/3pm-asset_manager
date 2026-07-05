/**
 * Vendor controller -- CRUD business logic for vendors collection.
 * MongoDB native driver, no Mongoose/ODM.
 */
import { ObjectId } from 'mongodb';
import { getVendorsCollection } from '@/lib/mongodb';
import { validateCreateVendorInput, serializeVendor } from './utils';
import type { CreateVendorInput, UpdateVendorInput } from './types';

/** List vendors with pagination, search, and optional type filter. */
export async function getAllVendors(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; vendorType?: string; showArchived?: boolean },
) {
  const collection = await getVendorsCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    tenantId: ObjectId.createFromHexString(tenantId),
  };

  if (options.showArchived) {
    filter.isArchived = true;
  } else {
    filter.isArchived = { $ne: true };
  }

  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    filter.$or = [
      { name: regex },
      { contactName: regex },
      { email: regex },
    ];
  }

  if (options.vendorType) {
    filter.vendorTypes = options.vendorType;
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => serializeVendor(item)),
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

/** Get a single vendor by ID. */
export async function getVendorById(tenantId: string, vendorId: string) {
  const collection = await getVendorsCollection();
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(vendorId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });

  if (!doc) return null;
  return serializeVendor(doc);
}

/** Create a new vendor. */
export async function createVendor(tenantId: string, userId: string, input: CreateVendorInput) {
  const validation = validateCreateVendorInput(input);
  if (!validation.valid) {
    return { data: null, error: validation.errors };
  }

  const collection = await getVendorsCollection();
  const now = new Date();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    name: input.name.trim(),
    address: input.address?.trim() || undefined,
    website: input.website?.trim() || undefined,
    contactName: input.contactName.trim(),
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim().toLowerCase() || undefined,
    vendorTypes: input.vendorTypes || [],
    publicEditAccess: input.publicEditAccess !== false,
    laborRatePerHour: input.laborRatePerHour ?? undefined,

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
    data: serializeVendor({ ...doc, _id: result.insertedId }),
    error: null,
  };
}

/** Update an existing vendor. */
export async function updateVendor(
  tenantId: string,
  userId: string,
  vendorId: string,
  input: UpdateVendorInput,
) {
  const collection = await getVendorsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const vendorOid = ObjectId.createFromHexString(vendorId);

  const existing = await collection.findOne({
    _id: vendorOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });
  if (!existing) return { data: null, error: 'Vendor not found' };

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) return { data: null, error: { name: 'Vendor name is required' } };
    if (trimmed.length > 160) return { data: null, error: { name: 'Vendor name must be at most 160 characters' } };
    $set.name = trimmed;
  }

  if (input.contactName !== undefined) {
    const trimmed = input.contactName.trim();
    if (!trimmed) return { data: null, error: { contactName: 'Contact name is required' } };
    if (trimmed.length > 120) return { data: null, error: { contactName: 'Contact name must be at most 120 characters' } };
    $set.contactName = trimmed;
  }

  if (input.address !== undefined) $set.address = input.address?.trim() || undefined;
  if (input.website !== undefined) $set.website = input.website?.trim() || undefined;
  if (input.phone !== undefined) $set.phone = input.phone?.trim() || undefined;
  if (input.email !== undefined) $set.email = input.email?.trim().toLowerCase() || undefined;
  if (input.vendorTypes !== undefined) $set.vendorTypes = input.vendorTypes || [];
  if (input.publicEditAccess !== undefined) $set.publicEditAccess = input.publicEditAccess !== false;
  if (input.laborRatePerHour !== undefined) $set.laborRatePerHour = input.laborRatePerHour ?? undefined;

  await collection.updateOne({ _id: vendorOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: vendorOid });

  return { data: updated ? serializeVendor(updated) : null, error: null };
}

/** Permanently delete a vendor. */
export async function deleteVendor(tenantId: string, userId: string, vendorId: string) {
  const collection = await getVendorsCollection();
  const docOid = ObjectId.createFromHexString(vendorId);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const result = await collection.deleteOne({ _id: docOid, tenantId: tenantOid });
  return result.deletedCount > 0;
}
