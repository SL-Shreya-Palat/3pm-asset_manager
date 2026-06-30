/**
 * Users controller -- CRUD business logic for tenantMembers collection.
 * Manages user invitations and tenant membership.
 * MongoDB native driver, no Mongoose/ODM.
 */
import { ObjectId } from 'mongodb';
import {
  getTenantMembersCollection,
  getUsersCollection,
  getRolesCollection,
  getTenantsCollection,
} from '@/lib/mongodb';
import { validateInviteUserInput, serializeTenantMember } from './utils';
import { createInvitation } from '@/controller/invitations';
import { sendInvitationEmail } from '@/lib/email';
import type { InviteUserInput, UpdateTenantMemberInput } from './types';

/** Build a role name lookup map for a tenant. */
async function getRoleMap(tenantOid: ObjectId): Promise<Map<string, string>> {
  const rolesCol = await getRolesCollection();
  const roles = await rolesCol
    .find({ tenantId: tenantOid, isArchived: { $ne: true } })
    .project({ _id: 1, name: 1 })
    .toArray();
  const map = new Map<string, string>();
  for (const r of roles) {
    map.set(r._id.toString(), r.name as string);
  }
  return map;
}

/** List tenant members with pagination and search. */
export async function getAllTenantMembers(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string },
) {
  const collection = await getTenantMembersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { tenantId: tenantOid };

  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    filter.$or = [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
    ];
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  // Resolve role names
  const roleMap = await getRoleMap(tenantOid);
  const serialized = items.map((item) => {
    const roleId = item.roleId ? item.roleId.toString() : undefined;
    return serializeTenantMember(item, roleId ? roleMap.get(roleId) : undefined);
  });

  return {
    items: serialized,
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

/** Get a single tenant member by ID. */
export async function getTenantMemberById(tenantId: string, memberId: string) {
  const collection = await getTenantMembersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const doc = await collection.findOne({
    _id: ObjectId.createFromHexString(memberId),
    tenantId: tenantOid,
  });

  if (!doc) return null;

  const roleMap = await getRoleMap(tenantOid);
  const roleId = doc.roleId ? doc.roleId.toString() : undefined;
  return serializeTenantMember(doc, roleId ? roleMap.get(roleId) : undefined);
}

/** Invite a user — creates users + tenantMembers records. */
export async function inviteUser(tenantId: string, invitedByUserId: string, input: InviteUserInput) {
  const validation = validateInviteUserInput(input);
  if (!validation.valid) {
    return { data: null, error: validation.errors };
  }

  const tenantMembersCol = await getTenantMembersCollection();
  const usersCol = await getUsersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const invitedByOid = ObjectId.createFromHexString(invitedByUserId);
  const normalizedEmail = input.email.trim().toLowerCase();
  const now = new Date();

  // Check duplicate email in this tenant
  const existing = await tenantMembersCol.findOne({
    tenantId: tenantOid,
    email: normalizedEmail,
  });
  if (existing) {
    return { data: null, error: { email: 'A user with this email already exists in this account' } };
  }

  // Check if this user already exists (e.g. registered via SSO before).
  // If they already have a verified account, link them directly and set active.
  const existingUser = await usersCol.findOne({ email: normalizedEmail });
  const isAlreadyVerified = existingUser?.emailVerified === true;

  // Insert tenantMember — only link userId and set active if the user is already verified
  const tmDoc: Record<string, unknown> = {
    ...(isAlreadyVerified && existingUser ? { userId: existingUser._id } : {}),
    tenantId: tenantOid,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: normalizedEmail,
    mobileNumber: input.mobileNumber?.trim() || undefined,
    roleId: ObjectId.createFromHexString(input.roleId),
    isActive: true,
    portalUser: true,
    status: isAlreadyVerified ? 'active' : 'pending',
    invitedBy: invitedByOid,
    invitedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const tmResult = await tenantMembersCol.insertOne(tmDoc);

  // Resolve role name for response
  const roleMap = await getRoleMap(tenantOid);
  const roleName = roleMap.get(input.roleId);

  // 3. Create invitation record + send email (non-blocking, don't fail the invite)
  try {
    const { rawToken } = await createInvitation(tenantId, {
      email: normalizedEmail,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      roleId: input.roleId,
      invitedByUserId,
    });

    // Build accept URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${appUrl}/invite/accept?token=${rawToken}`;

    // Resolve inviter name + tenant name for the email
    const inviter = await usersCol.findOne({ _id: invitedByOid });
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
      roleName: roleName || 'Member',
      acceptUrl,
    });
  } catch (emailError) {
    console.error('[inviteUser] Failed to send invitation email:', emailError);
  }

  return {
    data: serializeTenantMember({ ...tmDoc, _id: tmResult.insertedId }, roleName),
    error: null,
  };
}

/** Update a tenant member. */
export async function updateTenantMember(
  tenantId: string,
  memberId: string,
  input: UpdateTenantMemberInput,
) {
  const collection = await getTenantMembersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const memberOid = ObjectId.createFromHexString(memberId);

  const existing = await collection.findOne({ _id: memberOid, tenantId: tenantOid });
  if (!existing) return { data: null, error: 'User not found' };

  const $set: Record<string, unknown> = { updatedAt: new Date() };

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
  if (input.email !== undefined) {
    const normalizedEmail = input.email.trim().toLowerCase();
    // Check duplicate
    const dup = await collection.findOne({
      tenantId: tenantOid,
      _id: { $ne: memberOid },
      email: normalizedEmail,
    });
    if (dup) return { data: null, error: { email: 'A user with this email already exists' } };
    $set.email = normalizedEmail;
  }
  if (input.roleId !== undefined) {
    $set.roleId = ObjectId.createFromHexString(input.roleId);
  }
  if (input.mobileNumber !== undefined) {
    $set.mobileNumber = input.mobileNumber?.trim() || undefined;
  }

  await collection.updateOne({ _id: memberOid, tenantId: tenantOid }, { $set });
  const updated = await collection.findOne({ _id: memberOid });

  const roleMap = await getRoleMap(tenantOid);
  const roleId = updated?.roleId ? updated.roleId.toString() : undefined;
  return {
    data: updated ? serializeTenantMember(updated, roleId ? roleMap.get(roleId) : undefined) : null,
    error: null,
  };
}

/** Deactivate a tenant member. */
export async function deactivateTenantMember(tenantId: string, memberId: string) {
  const collection = await getTenantMembersCollection();
  const result = await collection.updateOne(
    {
      _id: ObjectId.createFromHexString(memberId),
      tenantId: ObjectId.createFromHexString(tenantId),
    },
    { $set: { isActive: false, updatedAt: new Date() } },
  );
  return result.modifiedCount > 0;
}
