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
  if (!ObjectId.isValid(input.roleId)) {
    return { data: null, error: { roleId: 'Invalid role' } };
  }
  const rolesColForInvite = await getRolesCollection();
  const invitedRole = await rolesColForInvite.findOne(
    { _id: ObjectId.createFromHexString(input.roleId), tenantId: tenantOid, isArchived: { $ne: true } },
    { projection: { teamScoped: 1 } },
  );
  if (!invitedRole) {
    return { data: null, error: { roleId: 'Invalid role' } };
  }

  // Resolve + validate requested teams (must belong to this tenant, active).
  // The membership `role` is informational only — access is driven by the
  // membership's existence (see [[team RBAC]]); 'managing' is the sensible
  // default for someone deliberately placed on a team at invite time.
  const requestedTeamIds = Array.isArray(input.teamIds)
    ? input.teamIds.filter((id) => ObjectId.isValid(id))
    : [];
  let teamMemberships: Array<{ teamId: ObjectId; role: 'managing' | 'following' }> = [];
  if (requestedTeamIds.length > 0) {
    const teamsCol = await getTeamsCollection();
    const validTeams = await teamsCol
      .find(
        {
          tenantId: tenantOid,
          _id: { $in: requestedTeamIds.map((id) => ObjectId.createFromHexString(id)) },
          isArchived: { $ne: true },
        },
        { projection: { _id: 1 } },
      )
      .toArray();
    teamMemberships = validTeams.map((t) => ({ teamId: t._id as ObjectId, role: 'managing' as const }));
  }
  // A team-scoped role with no team has no scope at all (empty teamIds → sees
  // nothing). Rather than hard-blocking the invite (which made "Import staff
  // from Command" — which has no per-person team picker — reject EVERY
  // team-scoped role assignment), default to ALL of the tenant's existing
  // teams. Sensible for a small org with one or a handful of teams; a tenant
  // with genuinely zero teams still can't default to anything meaningful.
  if (invitedRole.teamScoped === true && teamMemberships.length === 0) {
    const teamsCol = await getTeamsCollection();
    const allTeams = await teamsCol
      .find({ tenantId: tenantOid, isArchived: { $ne: true } }, { projection: { _id: 1 } })
      .toArray();
    if (allTeams.length === 0) {
      return {
        data: null,
        error: { teamIds: 'This tenant has no teams yet — create a team first, or choose a non-team-scoped role' },
      };
    }
    teamMemberships = allTeams.map((t) => ({ teamId: t._id as ObjectId, role: 'managing' as const }));
  }

  // Check if this user already exists (e.g. registered via SSO before).
  // If they already have a verified account, link the userId directly.
  const existingUser = await usersCol.findOne({ email: normalizedEmail });
  const isAlreadyVerified = existingUser?.emailVerified === true;

  // 3pm-auth is the ONLY invitation path — resolve it BEFORE creating any
  // local state. Fail loud on misconfiguration (matches construction-portal:
  // a tenant with no authTenantId link must surface a clear error, never
  // silently create a "pending" member with no invite ever sent).
  const tenantsCol = await getTenantsCollection();
  const tenantDoc = await tenantsCol.findOne({ _id: tenantOid });
  const authTenantId = (tenantDoc as { authTenantId?: ObjectId })?.authTenantId?.toString();
  if (!authTenantId) {
    console.error('[inviteUser] Tenant has no authTenantId — cannot create 3PM invitation');
    return {
      data: null,
      error: { email: 'This organization is not connected to 3PM Auth — contact support' },
    };
  }

  // Resolve role name for the invite email + response.
  const roleMap = await getRoleMap(tenantOid);
  const roleName = roleMap.get(input.roleId);

  // Pre-register the user in 3pm-auth so they can log in directly (skip the
  // registration/secondary-verification flow). Safe to call every time —
  // returns status: "skipped" if the email already exists. Non-fatal: the
  // invitation can still be sent even if pre-registration fails; the user
  // would just hit the registration flow on first login as a fallback.
  try {
    await create3PMUser({
      email: normalizedEmail,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      mobile: input.mobileNumber?.trim(),
    });
  } catch (userCreateError) {
    console.warn('[inviteUser] Failed to pre-register user in 3pm-auth:', userCreateError);
  }

  // Resolve inviter name for the email context.
  const inviter = await usersCol.findOne({ _id: invitedByOid });
  const inviterName = inviter
    ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim()
    : undefined;

  // Create the invitation on 3pm-auth FIRST — it's the only invitation path
  // and the only thing that actually sends an email. Fail loud here (no
  // tenantMember is created) instead of the previous behavior, which inserted
  // the tenantMember unconditionally and only console.error'd a 3PM failure —
  // leaving a "pending" member the invited person could never actually accept
  // into, with the admin UI reporting success regardless.
  let threePMInvite: { id: string; expiresAt: string } | null = null;
  // Every staff member must explicitly ACCEPT an invite before they can use
  // Asset Manager — nobody gets in silently. 3pm-auth refuses to create a
  // NEW invitation for someone who is ALREADY a tenant member there
  // (extremely common for "Import staff from Command": Command staff already
  // have 3pm-auth accounts under this same org), so this flag routes them to
  // the local (legacy) invite mechanism below instead — same accept-required
  // flow drivers already use, just via AM's own token/email since 3pm-auth's
  // invitation endpoint won't issue one for an existing member.
  let alreadyThreePMMember = false;
  try {
    threePMInvite = await create3PMInvitation({
      tenantId: authTenantId,
      email: normalizedEmail,
      role: 'member',
      recipientName: `${input.firstName.trim()} ${input.lastName.trim()}`.trim(),
      inviterName,
      roleLabel: roleName || 'Member',
    });
  } catch (inviteError) {
    const message = inviteError instanceof Error ? inviteError.message : 'Failed to send invitation';
    if (/already a member of this tenant/i.test(message)) {
      alreadyThreePMMember = true;
    } else {
      console.error('[inviteUser] Failed to create 3PM invitation:', inviteError);
      return { data: null, error: { email: message } };
    }
  }

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
    ...(teamMemberships.length > 0 ? { teamMemberships } : {}),
    isActive: true,
    portalUser: true,
    status: 'pending',
    invitedBy: invitedByOid,
    invitedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const tmResult = await tenantMembersCol.insertOne(tmDoc);

  if (threePMInvite) {
    // Store local mirror so the auth callback can complete it. Non-fatal: the
    // invitation already exists on 3pm-auth and its email was already sent —
    // losing the local mirror only means the callback can't auto-complete it
    // (a resend would recreate the mirror). Failing the whole request here
    // would falsely report an error for an invite that DID go out.
    try {
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
    } catch (mirrorError) {
      console.error('[inviteUser] Failed to store local 3PM invitation mirror:', mirrorError);
    }
  } else if (alreadyThreePMMember) {
    // Already a 3pm-auth tenant member — 3pm-auth won't issue a new
    // invitation, but they still must explicitly ACCEPT before they can use
    // Asset Manager (matches every other invite path — nobody gets in
    // silently). Send AM's own local/legacy invite instead: same
    // hashed-token + email + accept-link mechanism drivers already use.
    // Non-fatal: the tenantMember row already exists either way; a failed
    // email just means the admin needs to hit Resend.
    try {
      const { rawToken } = await createInvitation(tenantId, {
        email: normalizedEmail,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        roleId: input.roleId,
        invitedByUserId: invitedByUserId,
      });
      const acceptUrl = `${getAppUrl()}/invite/accept?token=${rawToken}`;
      await sendInvitationEmail({
        recipientEmail: normalizedEmail,
        recipientName: input.firstName.trim(),
        inviterName: inviterName || 'A team member',
        tenantName: (tenantDoc?.name as string) || 'your organization',
        roleName: roleName || 'Member',
        acceptUrl,
      });
    } catch (localInviteError) {
      console.error('[inviteUser] Failed to send local invite for existing 3pm-auth member:', localInviteError);
    }
  }

  return {
    data: serializeTenantMember({ ...tmDoc, _id: tmResult.insertedId }, roleName),
    error: null,
    // Signals to callers (e.g. importCommandStaff) that this person needed
    // AM's own accept-link email instead of a 3pm-auth invitation — they
    // still must accept it the same as anyone else before they get access.
    alreadyThreePMMember,
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

    let threePMInvite: { id: string; expiresAt: string } | null = null;
    try {
      threePMInvite = await create3PMInvitation({
        tenantId: authTenantId,
        email,
        role: 'member',
        recipientName: `${firstName} ${lastName}`.trim(),
        inviterName,
        roleLabel: roleName,
      });
    } catch (inviteError) {
      const message = inviteError instanceof Error ? inviteError.message : 'Failed to resend invitation';
      if (!/already a member of this tenant/i.test(message)) {
        throw inviteError;
      }
      // Already a confirmed 3pm-auth tenant member — 3pm-auth won't issue a
      // new invitation. They STILL must explicitly accept before using Asset
      // Manager (same requirement as everyone else), so fall through to the
      // local/legacy invite flow below instead of the 3PM one.
    }

    if (threePMInvite) {
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
    // alreadyThreePMMember → falls through to the local/legacy flow below.
  }

  // ── Drivers, non-portal members, and already-a-3pm-auth-member portal
  //    members (see above) → local accept-link token flow ─────────────────
  if (!member.roleId) return { data: null, error: 'This user has no role assigned' };

  // Pre-register in 3pm-auth so they get a direct login on accept instead of
  // the full registration/OTP flow — mirrors createDriver(). For the
  // already-a-3pm-auth-member fallthrough this is a safe no-op (returns
  // "skipped"); for a driver with no account yet, it's what makes their
  // accept smooth.
  if (authTenantId) {
    try {
      await create3PMUser({
        email,
        firstName,
        lastName,
        mobile: (member.mobileNumber as string | undefined)?.trim(),
      });
    } catch (userCreateError) {
      console.warn('[resendInvitation] Failed to pre-register user in 3pm-auth:', userCreateError);
    }
  }

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
