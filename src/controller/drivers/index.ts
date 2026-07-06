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
  getTenantsCollection,
} from '@/lib/mongodb';
import { validateCreateDriverInput, serializeDriver } from './utils';
import { createInvitation } from '@/controller/invitations';
import { sendInvitationEmail } from '@/lib/email';
import {
  isCommandConnectionEnabled,
  stripCommandOwnedFields,
  MASTER_DATA_MANAGED_MESSAGE,
} from '@/controller/command-connection/guard';
import type { CreateDriverInput, UpdateDriverInput } from './types';

/** List drivers with pagination and search. */
export async function getAllDrivers(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; teamId?: string; showArchived?: boolean },
) {
  const collection = await getDriversCollection();
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
      v: 2,
      forms: [
        { id: 'inspections.inspections.inspection', v: 'ALL', c: true, e: false },
      ],
      m: ['inspections'],
      sm: ['inspections.inspections'],
    },
    teamScoped: true,
    mobileOnly: true,
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
  // Connected tenants add people in Command (staff), then import as drivers.
  if (await isCommandConnectionEnabled(tenantId)) {
    return { data: null, error: MASTER_DATA_MANAGED_MESSAGE };
  }

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
    const { tenantMemberId, roleId } = await createTenantMemberForDriver(
      tenantOid, userOid, now,
      { firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: normalizedEmail },
    );

    // 3. Update driver with tenantMemberId
    await collection.updateOne({ _id: driverId }, { $set: { tenantMemberId } });
    doc.tenantMemberId = tenantMemberId;

    // 4. Send invitation email if driver has an email
    if (normalizedEmail) {
      try {
        const { rawToken } = await createInvitation(tenantId, {
          email: normalizedEmail,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          roleId: roleId.toString(),
          invitedByUserId: userId,
        });

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const acceptUrl = `${appUrl}/invite/accept?token=${rawToken}`;

        const usersCol = await getUsersCollection();
        const inviter = await usersCol.findOne({ _id: userOid });
        const inviterName = inviter
          ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim()
          : 'A team member';

        const tenantsCol = await getTenantsCollection();
        const tenant = await tenantsCol.findOne({ _id: tenantOid });
        const tenantName = (tenant?.name as string) || 'your organization';

        await sendInvitationEmail({
          recipientEmail: normalizedEmail,
          recipientName: input.firstName.trim(),
          inviterName,
          tenantName,
          roleName: 'Driver',
          acceptUrl,
        });
      } catch (emailError) {
        console.error('[driver] Failed to send invitation email:', emailError);
      }
    }
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
): Promise<{ tenantMemberId: ObjectId; roleId: ObjectId }> {
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
        status: 'pending',
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

  return { tenantMemberId: tmResult!._id as ObjectId, roleId: driverRoleId };
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

  // Command-sourced drivers: name/email/mobile are owned by Command staff —
  // strip them from local edits (licence & AM-only fields still save).
  if (existing.source === 'command') {
    const guarded = stripCommandOwnedFields(input as Record<string, unknown>, 'drivers');
    input = guarded.input as UpdateDriverInput;
    if (guarded.stripped.length > 0) {
      console.warn(
        `[drivers] Ignored Command-owned field edit on ${driverId}: ${guarded.stripped.join(', ')}`,
      );
    }
  }

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

/** Permanently delete a driver and deactivate the linked tenantMember. */
export async function deleteDriver(tenantId: string, userId: string, driverId: string) {
  const collection = await getDriversCollection();
  const driverOid = ObjectId.createFromHexString(driverId);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  // Fetch driver first to get tenantMemberId before deletion
  const driver = await collection.findOne({
    _id: driverOid,
    tenantId: tenantOid,
  });
  if (!driver) return false;

  const result = await collection.deleteOne({ _id: driverOid, tenantId: tenantOid });

  // Deactivate the linked tenantMember
  if (driver.tenantMemberId) {
    try {
      const tenantMembersCol = await getTenantMembersCollection();
      await tenantMembersCol.updateOne(
        { _id: driver.tenantMemberId as ObjectId },
        { $set: { isActive: false, updatedAt: new Date() } },
      );
    } catch (err) {
      console.error('[driver] Failed to deactivate tenantMember:', err);
    }
  }

  return result.deletedCount > 0;
}
