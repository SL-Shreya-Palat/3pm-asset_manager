/**
 * Driver controller -- CRUD business logic for drivers collection.
 * MongoDB native driver, no Mongoose/ODM.
 */
import { ObjectId } from 'mongodb';
import {
  getDriversCollection,
  getUsersCollection,
  getTenantMembersCollection,
  getRolesCollection,
} from '@/lib/mongodb';
import { validateCreateDriverInput, serializeDriver } from './utils';
import type { CreateDriverInput, UpdateDriverInput } from './types';

/** List drivers with pagination and search. */
export async function getAllDrivers(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; teamId?: string },
) {
  const collection = await getDriversCollection();
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
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { employeeNumber: regex },
    ];
  }

  if (options.teamId) {
    filter.teamId = ObjectId.createFromHexString(options.teamId);
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  const serialized = items.map((item) => serializeDriver(item));

  return {
    items: serialized,
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

/** Get a single driver by ID. */
export async function getDriverById(tenantId: string, driverId: string) {
  const collection = await getDriversCollection();
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(driverId),
    tenantId: ObjectId.createFromHexString(tenantId),
    isArchived: { $ne: true },
  });

  if (!doc) return null;
  return serializeDriver(doc);
}

/**
 * Resolve (or auto-create) the "Driver" role for a tenant.
 * Looks up by key first; creates with the driver permission preset if missing.
 */
async function resolveDriverRoleId(tenantOid: ObjectId, createdByOid: ObjectId): Promise<ObjectId> {
  const rolesCol = await getRolesCollection();
  const now = new Date();

  const existing = await rolesCol.findOne({
    tenantId: tenantOid,
    key: 'driver',
    isArchived: { $ne: true },
  });

  if (existing) return existing._id as ObjectId;

  // Auto-create Driver role with mobile-only inspection access
  const result = await rolesCol.insertOne({
    tenantId: tenantOid,
    name: 'Driver',
    key: 'driver',
    nameLower: 'driver',
    description: 'Mobile-only access for completing inspections.',
    permissions: {
      scope: 'modules',
      modules: {
        inspections: { view: true, create: true, update: false, delete: false, export: false, bulkUpload: false },
      },
      teamScoped: true,
      mobileOnly: true,
    },
    isSystem: false,
    isActive: true,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    createdBy: createdByOid,
    updatedBy: createdByOid,
    createdAt: now,
    updatedAt: now,
  });

  return result.insertedId;
}

/** Create a new driver. */
export async function createDriver(tenantId: string, userId: string, input: CreateDriverInput) {
  const validation = validateCreateDriverInput(input);
  if (!validation.valid) {
    return { data: null, error: validation.errors };
  }

  const collection = await getDriversCollection();
  const now = new Date();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);
  const normalizedEmail = input.email?.trim().toLowerCase() || undefined;

  const doc: Record<string, unknown> = {
    tenantId: tenantOid,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: normalizedEmail,
    photoUrl: input.photoUrl || undefined,
    notes: input.notes?.trim() || undefined,
    teamId: input.teamId ? ObjectId.createFromHexString(input.teamId) : undefined,
    countryCode: input.countryCode?.trim() || undefined,
    mobileNumber: input.mobileNumber?.trim() || undefined,
    homePhone: input.homePhone?.trim() || undefined,
    workPhone: input.workPhone?.trim() || undefined,
    dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,

    employeeNumber: input.employeeNumber?.trim() || undefined,
    jobPosition: input.jobPosition?.trim() || undefined,
    rateCurrency: input.rateCurrency?.trim() || undefined,
    ratePerUnit: input.ratePerUnit ?? undefined,
    otherNotes: input.otherNotes?.trim() || undefined,

    driverLicense: input.driverLicense?.trim() || undefined,
    licenseClass: input.licenseClass?.trim() || undefined,
    licenseNumber: input.licenseNumber?.trim() || undefined,
    healthCertificate: input.healthCertificate?.trim() || undefined,

    createdBy: userOid,
    updatedBy: userOid,
    createdAt: now,
    updatedAt: now,
    isActive: true,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  };

  // 1. Insert driver document
  const driverResult = await collection.insertOne(doc);
  const driverId = driverResult.insertedId;

  // 2. Create user + tenantMember and link back
  try {
    const tenantMemberId = await createTenantMemberForDriver(
      tenantOid, userOid, now,
      { firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: normalizedEmail },
    );

    // 3. Update driver with tenantMemberId
    await collection.updateOne({ _id: driverId }, { $set: { tenantMemberId } });
    doc.tenantMemberId = tenantMemberId;
  } catch (err) {
    // Non-fatal: driver is created, but tenantMember linkage failed.
    // Log and continue — the driver record is still valid.
    console.error('[driver] Failed to create tenantMember for driver:', err);
  }

  return {
    data: serializeDriver({ ...doc, _id: driverId }),
    error: null,
  };
}

/**
 * Create a users record and tenantMembers record for a newly created driver.
 * Returns the tenantMember._id.
 */
async function createTenantMemberForDriver(
  tenantOid: ObjectId,
  createdByOid: ObjectId,
  now: Date,
  driver: { firstName: string; lastName: string; email?: string },
): Promise<ObjectId> {
  const usersCol = await getUsersCollection();
  const tenantMembersCol = await getTenantMembersCollection();

  // 1. Resolve the Driver role
  const driverRoleId = await resolveDriverRoleId(tenantOid, createdByOid);

  // 2. Upsert user — match by email if available, otherwise insert new
  let localUserId: ObjectId;
  if (driver.email) {
    const userResult = await usersCol.findOneAndUpdate(
      { email: driver.email },
      {
        $set: { firstName: driver.firstName, lastName: driver.lastName, updatedAt: now },
        $setOnInsert: {
          email: driver.email,
          phoneNumber: null,
          profileImageUrl: null,
          isActive: true,
          emailVerified: false,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    localUserId = userResult!._id as ObjectId;
  } else {
    // No email — insert a standalone user record
    const userResult = await usersCol.insertOne({
      firstName: driver.firstName,
      lastName: driver.lastName,
      email: null,
      phoneNumber: null,
      profileImageUrl: null,
      isActive: true,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });
    localUserId = userResult.insertedId;
  }

  // 3. Upsert tenantMember — unique on (userId, tenantId)
  const tmResult = await tenantMembersCol.findOneAndUpdate(
    { userId: localUserId, tenantId: tenantOid },
    {
      $set: {
        firstName: driver.firstName,
        lastName: driver.lastName,
        roleId: driverRoleId,
        email: driver.email || null,
        isActive: true,
        portalUser: false,
        updatedAt: now,
      },
      $setOnInsert: {
        userId: localUserId,
        tenantId: tenantOid,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  return tmResult!._id as ObjectId;
}

/** Update an existing driver. */
export async function updateDriver(
  tenantId: string,
  userId: string,
  driverId: string,
  input: UpdateDriverInput,
) {
  const collection = await getDriversCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const driverOid = ObjectId.createFromHexString(driverId);

  const existing = await collection.findOne({
    _id: driverOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });
  if (!existing) return { data: null, error: 'Driver not found' };

  const $set: Record<string, unknown> = {
    updatedBy: ObjectId.createFromHexString(userId),
    updatedAt: new Date(),
  };

  if (input.firstName !== undefined) {
    const trimmed = input.firstName.trim();
    if (!trimmed) return { data: null, error: { firstName: 'First name is required' } };
    $set.firstName = trimmed;
  }

  if (input.lastName !== undefined) {
    const trimmed = input.lastName.trim();
    if (!trimmed) return { data: null, error: { lastName: 'Last name is required' } };
    $set.lastName = trimmed;
  }

  if (input.email !== undefined) $set.email = input.email?.trim() || undefined;
  if (input.photoUrl !== undefined) $set.photoUrl = input.photoUrl || undefined;
  if (input.notes !== undefined) $set.notes = input.notes?.trim() || undefined;
  if (input.teamId !== undefined) {
    $set.teamId = input.teamId ? ObjectId.createFromHexString(input.teamId) : undefined;
  }
  if (input.countryCode !== undefined) $set.countryCode = input.countryCode?.trim() || undefined;
  if (input.mobileNumber !== undefined) $set.mobileNumber = input.mobileNumber?.trim() || undefined;
  if (input.homePhone !== undefined) $set.homePhone = input.homePhone?.trim() || undefined;
  if (input.workPhone !== undefined) $set.workPhone = input.workPhone?.trim() || undefined;
  if (input.dateOfBirth !== undefined) {
    $set.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
  }

  if (input.employeeNumber !== undefined) $set.employeeNumber = input.employeeNumber?.trim() || undefined;
  if (input.jobPosition !== undefined) $set.jobPosition = input.jobPosition?.trim() || undefined;
  if (input.rateCurrency !== undefined) $set.rateCurrency = input.rateCurrency?.trim() || undefined;
  if (input.ratePerUnit !== undefined) $set.ratePerUnit = input.ratePerUnit ?? undefined;
  if (input.otherNotes !== undefined) $set.otherNotes = input.otherNotes?.trim() || undefined;

  if (input.driverLicense !== undefined) $set.driverLicense = input.driverLicense?.trim() || undefined;
  if (input.licenseClass !== undefined) $set.licenseClass = input.licenseClass?.trim() || undefined;
  if (input.licenseNumber !== undefined) $set.licenseNumber = input.licenseNumber?.trim() || undefined;
  if (input.healthCertificate !== undefined) $set.healthCertificate = input.healthCertificate?.trim() || undefined;

  await collection.updateOne({ _id: driverOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: driverOid });

  // Sync name/email changes to the linked tenantMember
  if (updated?.tenantMemberId && (input.firstName !== undefined || input.lastName !== undefined || input.email !== undefined)) {
    try {
      const tenantMembersCol = await getTenantMembersCollection();
      const tmUpdate: Record<string, unknown> = { updatedAt: new Date() };
      if (input.firstName !== undefined) tmUpdate.firstName = input.firstName.trim();
      if (input.lastName !== undefined) tmUpdate.lastName = input.lastName.trim();
      if (input.email !== undefined) tmUpdate.email = input.email?.trim().toLowerCase() || null;
      await tenantMembersCol.updateOne(
        { _id: updated.tenantMemberId as ObjectId },
        { $set: tmUpdate },
      );
    } catch (err) {
      console.error('[driver] Failed to sync tenantMember name:', err);
    }
  }

  return { data: updated ? serializeDriver(updated) : null, error: null };
}

/** Archive (soft-delete) a driver and deactivate the linked tenantMember. */
export async function deleteDriver(tenantId: string, userId: string, driverId: string) {
  const collection = await getDriversCollection();
  const driverOid = ObjectId.createFromHexString(driverId);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  // Fetch driver first to get tenantMemberId
  const driver = await collection.findOne({
    _id: driverOid,
    tenantId: tenantOid,
    isArchived: { $ne: true },
  });
  if (!driver) return false;

  const now = new Date();
  const userOid = ObjectId.createFromHexString(userId);

  const result = await collection.updateOne(
    { _id: driverOid, tenantId: tenantOid },
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

  // Deactivate the linked tenantMember
  if (driver.tenantMemberId) {
    try {
      const tenantMembersCol = await getTenantMembersCollection();
      await tenantMembersCol.updateOne(
        { _id: driver.tenantMemberId as ObjectId },
        { $set: { isActive: false, updatedAt: now } },
      );
    } catch (err) {
      console.error('[driver] Failed to deactivate tenantMember:', err);
    }
  }

  return result.modifiedCount > 0;
}
