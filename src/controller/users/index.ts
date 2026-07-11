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
  getTeamsCollection,
  getInvitationsCollection,
} from '@/lib/mongodb';
import { validateInviteUserInput, serializeTenantMember } from './utils';
import { createInvitation3PM, createInvitation } from '@/controller/invitations';
import {
  create3PMUser,
  create3PMInvitation,
  expire3PMInvitation,
  resend3PMInvitation,
} from '@/lib/3pm-data-api';
import { sendInvitationEmail } from '@/lib/email';
import { getAppUrl } from '@/lib/app-url';
import type { InviteUserInput, UpdateTenantMemberInput } from './types';

/**
 * Verify a roleId belongs to this tenant and is assignable (exists, active,
 * not archived). Blocks cross-tenant role injection and stale assignments.
 */
async function isAssignableRole(tenantOid: ObjectId, roleId: string): Promise<boolean> {
  if (!ObjectId.isValid(roleId)) return false;
  const rolesCol = await getRolesCollection();
  const role = await rolesCol.findOne(
    { _id: ObjectId.createFromHexString(roleId), tenantId: tenantOid, isArchived: { $ne: true } },
    { projection: { _id: 1 } },
  );
  return !!role;
}

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
  options: { page?: number; limit?: number; search?: string; teamId?: string; showArchived?: boolean; mechanicOnly?: boolean },
) {
  const collection = await getTenantMembersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { tenantId: tenantOid };

  if (options.showArchived) {
    filter.isArchived = true;
  } else {
    filter.isArchived = { $ne: true };
  }

  if (options.teamId) {
    filter['teamMemberships.teamId'] = ObjectId.createFromHexString(options.teamId);
  }

  // Restrict to members whose role is flagged as a mechanic role. Uses the
  // role's isMechanic flag (not the name), so renamed/custom mechanic roles
  // still qualify.
  if (options.mechanicOnly) {
    const rolesCol = await getRolesCollection();
    const mechanicRoles = await rolesCol
      .find({ tenantId: tenantOid, isMechanic: true, isArchived: { $ne: true } })
      .project({ _id: 1 })
      .toArray();
    filter.roleId = { $in: mechanicRoles.map((r) => r._id) };
  }

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

  // Populate team names
  const allTeamIds = items
    .flatMap((item) => {
      const memberships = Array.isArray(item.teamMemberships) ? item.teamMemberships : [];
      return memberships.map((m: Record<string, unknown>) => m.teamId as ObjectId).filter(Boolean);
    });
  const uniqueTeamIds = [...new Map(allTeamIds.map((id) => [id.toString(), id])).values()];

  let teamNameMap = new Map<string, string>();
  if (uniqueTeamIds.length > 0) {
    const teamsCollection = await getTeamsCollection();
    const teamDocs = await teamsCollection.find({ _id: { $in: uniqueTeamIds } }).toArray();
    teamNameMap = new Map(teamDocs.map((t) => [t._id.toString(), t.name as string]));
  }

  const serialized = items.map((item) => {
    const roleId = item.roleId ? item.roleId.toString() : undefined;
    const memberships = Array.isArray(item.teamMemberships) ? item.teamMemberships : [];
    const teamIds = memberships.map((m: Record<string, unknown>) => (m.teamId as ObjectId)?.toString()).filter(Boolean);
    const teamNames = teamIds.map((id: string) => teamNameMap.get(id)).filter(Boolean) as string[];

    // If filtering by a specific team, include the role for that team
    let teamRole: string | undefined;
    if (options.teamId) {
      const membership = memberships.find(
        (m: Record<string, unknown>) => (m.teamId as ObjectId)?.toString() === options.teamId,
      );
      teamRole = (membership?.role as string) || 'following';
    }

    return serializeTenantMember(item, roleId ? roleMap.get(roleId) : undefined, {
      teamIds,
      teamNames,
      teamRole,
    });
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

  // Role must belong to this tenant and be assignable.
  if (!(await isAssignableRole(tenantOid, input.roleId))) {
    return { data: null, error: { roleId: 'Invalid role' } };
  }

  // Check if this user already exists (e.g. registered via SSO before).
  // If they already have a verified account, link the userId directly.
  const existingUser = await usersCol.findOne({ email: normalizedEmail });
  const isAlreadyVerified = existingUser?.emailVerified === true;

  // Insert tenantMember. Always start as 'pending' ("Invited") — the status only
  // flips to 'active' when the invited user actually logs in (the login /
  // provisioning flow activates the membership). The userId is still linked
  // up front when the invitee already has a verified account.
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
    status: 'pending',
    invitedBy: invitedByOid,
    invitedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const tmResult = await tenantMembersCol.insertOne(tmDoc);

  // Resolve role name for response
  const roleMap = await getRoleMap(tenantOid);
  const roleName = roleMap.get(input.roleId);

  // 3. Create invitation via 3PM Data API (3pm-auth sends the email)
  try {
    const tenantsCol = await getTenantsCollection();
    const tenant = await tenantsCol.findOne({ _id: tenantOid });
    const authTenantId = (tenant as { authTenantId?: ObjectId })?.authTenantId?.toString();

    if (!authTenantId) {
      console.error('[inviteUser] Tenant has no authTenantId — cannot create 3PM invitation');
    } else {
      // Resolve inviter name for the email context
      const inviter = await usersCol.findOne({ _id: invitedByOid });
      const inviterName = inviter
        ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim()
        : undefined;

      // Pre-register the user in 3pm-auth so they can log in directly
      // (skip the registration/secondary-verification flow).
      // Safe to call every time — returns status: "skipped" if email exists.
      try {
        await create3PMUser({
          email: normalizedEmail,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          mobile: input.mobileNumber?.trim(),
        });
      } catch (userCreateError) {
        // Non-fatal: the invitation can still be sent; user would just
        // hit the registration flow on first login as a fallback.
        console.warn('[inviteUser] Failed to pre-register user in 3pm-auth:', userCreateError);
      }

      // Create invitation on 3pm-auth — 3pm-auth sends the email
      const threePMInvite = await create3PMInvitation({
        tenantId: authTenantId,
        email: normalizedEmail,
        role: 'member',
        recipientName: `${input.firstName.trim()} ${input.lastName.trim()}`.trim(),
        inviterName,
        roleLabel: roleName || 'Member',
      });

      // Store local mirror so the auth callback can complete it
      await createInvitation3PM(
        tenantOid,
        normalizedEmail,
        threePMInvite.id,
        {
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          roleId: input.roleId,
          mobileNumber: input.mobileNumber?.trim(),
        },
        invitedByOid,
        threePMInvite.expiresAt,
      );
    }
  } catch (inviteError) {
    console.error('[inviteUser] Failed to create 3PM invitation:', inviteError);
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
  callerUserId?: string,
) {
  const collection = await getTenantMembersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const memberOid = ObjectId.createFromHexString(memberId);

  const existing = await collection.findOne({ _id: memberOid, tenantId: tenantOid });
  if (!existing) return { data: null, error: 'User not found' };

  // Block self-role-change: admins cannot change their own role assignment.
  if (input.roleId !== undefined && callerUserId && existing.userId?.toString() === callerUserId) {
    return { data: null, error: 'You cannot change your own role' };
  }

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
    // Role must belong to this tenant and be assignable.
    if (!(await isAssignableRole(tenantOid, input.roleId))) {
      return { data: null, error: { roleId: 'Invalid role' } };
    }
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

/** Permanently delete a tenant member. */
export async function deactivateTenantMember(tenantId: string, memberId: string, callerUserId?: string) {
  const collection = await getTenantMembersCollection();
  const docOid = ObjectId.createFromHexString(memberId);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  // Protect the tenant owner from being deactivated; admins also can't remove
  // their own membership (prevents accidental self-lockout).
  const tenantsCol = await getTenantsCollection();
  const tenant = await tenantsCol.findOne({ _id: tenantOid });
  const member = await collection.findOne({ _id: docOid, tenantId: tenantOid });
  if (member?.userId && tenant?.ownerId && member.userId.toString() === tenant.ownerId.toString()) {
    return false;
  }
  if (member?.userId && callerUserId && member.userId.toString() === callerUserId) {
    return false;
  }

  const result = await collection.deleteOne({ _id: docOid, tenantId: tenantOid });

  // Revoke any open invitations for this member's email so the deleted
  // membership can't be resurrected by a later login (the auth callback
  // completes 'invited'/'accepted' invitations by email) or by re-clicking
  // the invite email link. Best-effort: a failure here must not undo the
  // removal itself.
  if (result.deletedCount > 0 && member?.email) {
    try {
      const invitationsCol = await getInvitationsCollection();
      const normalizedEmail = String(member.email).toLowerCase().trim();
      const openInvites = await invitationsCol
        .find({
          tenantId: tenantOid,
          email: normalizedEmail,
          status: { $in: ['pending', 'invited', 'accepted'] },
        })
        .toArray();

      if (openInvites.length > 0) {
        await invitationsCol.updateMany(
          { _id: { $in: openInvites.map((i) => i._id) } },
          { $set: { status: 'revoked', updatedAt: new Date() } },
        );

        // Also expire the invitation on 3pm-auth so the emailed IdP link
        // shows "Invitation expired" instead of silently re-accepting.
        for (const invite of openInvites) {
          if (invite.source === '3pm' && invite.threePMInvitationId) {
            try {
              await expire3PMInvitation(invite.threePMInvitationId);
            } catch (err) {
              console.warn('[deactivateTenantMember] Failed to expire 3PM invitation:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('[deactivateTenantMember] Failed to revoke invitations (non-fatal):', err);
    }
  }

  return result.deletedCount > 0;
}

/**
 * Resend an invitation to a member who hasn't accepted yet.
 *
 * - 3PM-sourced invites: ask 3pm-auth to resend its email; if that fails
 *   (e.g. the IdP invitation expired), fall back to creating a fresh one.
 * - Local (driver) invites: the raw token isn't stored (hash only), so a
 *   resend supersedes the old invitation with a fresh token + email.
 */
export async function resendInvitation(
  tenantId: string,
  memberId: string,
  requestedByUserId: string,
) {
  const tenantMembersCol = await getTenantMembersCollection();
  const invitationsCol = await getInvitationsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const memberOid = ObjectId.createFromHexString(memberId);

  const member = await tenantMembersCol.findOne({ _id: memberOid, tenantId: tenantOid });
  if (!member) return { data: null, error: 'User not found' };
  if (member.isArchived === true) {
    return { data: null, error: 'Cannot resend an invitation to an archived user' };
  }
  if (member.status !== 'pending') {
    return { data: null, error: 'This user has already accepted their invitation' };
  }
  const email = typeof member.email === 'string' ? member.email.toLowerCase().trim() : '';
  if (!email) return { data: null, error: 'This user has no email address' };

  const now = new Date();

  // Latest open invitation for this member (if any)
  const openInvites = await invitationsCol
    .find({ tenantId: tenantOid, email, status: { $in: ['invited', 'pending'] } })
    .sort({ createdAt: -1 })
    .toArray();
  const latest = openInvites[0];

  // ── 3PM-sourced invite: resend via the IdP (it sends the email) ────────
  if (latest?.source === '3pm' && latest.threePMInvitationId) {
    try {
      const result = await resend3PMInvitation(latest.threePMInvitationId as string);
      await invitationsCol.updateOne(
        { _id: latest._id },
        { $set: { expiresAt: new Date(result.expiresAt), updatedAt: now } },
      );
      return { data: { sent: true }, error: null };
    } catch (err) {
      console.warn('[resendInvitation] 3PM resend failed — creating a fresh invitation:', err);
      // fall through to fresh-invite creation below
    }
  }

  // ── Fresh invitation: supersede any old open rows first ────────────────
  if (openInvites.length > 0) {
    await invitationsCol.updateMany(
      { _id: { $in: openInvites.map((i) => i._id) } },
      { $set: { status: 'revoked', updatedAt: now } },
    );
    // Best-effort: expire superseded 3PM invitations on the IdP too.
    for (const invite of openInvites) {
      if (invite.source === '3pm' && invite.threePMInvitationId) {
        try {
          await expire3PMInvitation(invite.threePMInvitationId as string);
        } catch {
          /* non-fatal */
        }
      }
    }
  }

  // Shared context for the new invite
  const rolesCol = await getRolesCollection();
  const role = member.roleId ? await rolesCol.findOne({ _id: member.roleId }) : null;
  const roleName = (role?.name as string) || 'Member';

  const tenantsCol = await getTenantsCollection();
  const tenant = await tenantsCol.findOne({ _id: tenantOid });
  const authTenantId = (tenant as { authTenantId?: ObjectId } | null)?.authTenantId?.toString();

  const usersCol = await getUsersCollection();
  const invitedByOid = ObjectId.createFromHexString(requestedByUserId);
  const inviter = await usersCol.findOne({ _id: invitedByOid });
  const inviterName = inviter
    ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim()
    : undefined;

  const firstName = (member.firstName as string) || '';
  const lastName = (member.lastName as string) || '';

  // ── Portal members → 3PM flow (mirrors inviteUser) ─────────────────────
  if (member.portalUser !== false && authTenantId) {
    try {
      await create3PMUser({
        email,
        firstName,
        lastName,
        mobile: (member.mobileNumber as string | undefined)?.trim(),
      });
    } catch (userCreateError) {
      // Non-fatal: the invitation can still be sent.
      console.warn('[resendInvitation] Failed to pre-register user in 3pm-auth:', userCreateError);
    }

    const threePMInvite = await create3PMInvitation({
      tenantId: authTenantId,
      email,
      role: 'member',
      recipientName: `${firstName} ${lastName}`.trim(),
      inviterName,
      roleLabel: roleName,
    });

    await createInvitation3PM(
      tenantOid,
      email,
      threePMInvite.id,
      {
        firstName,
        lastName,
        roleId: member.roleId ? member.roleId.toString() : undefined,
        mobileNumber: (member.mobileNumber as string | undefined)?.trim(),
      },
      invitedByOid,
      threePMInvite.expiresAt,
    );

    return { data: { sent: true }, error: null };
  }

  // ── Drivers / non-portal members → local token flow ────────────────────
  if (!member.roleId) return { data: null, error: 'This user has no role assigned' };

  const { rawToken } = await createInvitation(tenantId, {
    email,
    firstName,
    lastName,
    roleId: member.roleId.toString(),
    invitedByUserId: requestedByUserId,
  });

  const acceptUrl = `${getAppUrl()}/invite/accept?token=${rawToken}`;

  const sent = await sendInvitationEmail({
    recipientEmail: email,
    recipientName: firstName || email,
    inviterName: inviterName || 'A team member',
    tenantName: (tenant?.name as string) || 'your organization',
    roleName,
    acceptUrl,
  });

  if (!sent) return { data: null, error: 'Failed to send the invitation email' };
  return { data: { sent: true }, error: null };
}

/** Bulk-add users to a team with a given role. */
export async function addUsersToTeam(
  tenantId: string,
  userId: string,
  teamId: string,
  memberIds: string[],
  role: 'managing' | 'following' = 'following',
) {
  const collection = await getTenantMembersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const teamOid = ObjectId.createFromHexString(teamId);
  const userOid = ObjectId.createFromHexString(userId);
  const memberOids = memberIds.map((id) => ObjectId.createFromHexString(id));

  const result = await collection.updateMany(
    {
      _id: { $in: memberOids },
      tenantId: tenantOid,
      'teamMemberships.teamId': { $ne: teamOid },
    },
    {
      $addToSet: { teamMemberships: { teamId: teamOid, role } },
      $set: { updatedBy: userOid, updatedAt: new Date() },
    },
  );

  return result.modifiedCount;
}

/** Remove a user from a team. */
export async function removeUserFromTeam(
  tenantId: string,
  userId: string,
  teamId: string,
  memberId: string,
) {
  const collection = await getTenantMembersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const teamOid = ObjectId.createFromHexString(teamId);
  const memberOid = ObjectId.createFromHexString(memberId);
  const userOid = ObjectId.createFromHexString(userId);

  const result = await collection.updateOne(
    { _id: memberOid, tenantId: tenantOid },
    {
      $pull: { teamMemberships: { teamId: teamOid } },
      $set: { updatedBy: userOid, updatedAt: new Date() },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  );

  return result.modifiedCount > 0;
}

/** Update a user's role within a team (managing / following). */
export async function updateUserTeamRole(
  tenantId: string,
  userId: string,
  teamId: string,
  memberId: string,
  role: 'managing' | 'following',
) {
  const collection = await getTenantMembersCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const teamOid = ObjectId.createFromHexString(teamId);
  const memberOid = ObjectId.createFromHexString(memberId);
  const userOid = ObjectId.createFromHexString(userId);

  const result = await collection.updateOne(
    {
      _id: memberOid,
      tenantId: tenantOid,
      'teamMemberships.teamId': teamOid,
    },
    {
      $set: {
        'teamMemberships.$.role': role,
        updatedBy: userOid,
        updatedAt: new Date(),
      },
    },
  );

  return result.modifiedCount > 0;
}
