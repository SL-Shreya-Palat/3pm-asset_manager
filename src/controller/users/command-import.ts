/**
 * Import Command staff as Asset Manager MEMBERS (login invitations).
 *
 * Command staff are HR records; Asset Manager members are login identities. So
 * we don't read-through staff — we seed member invitations from Command staff
 * (by email) via `inviteUser`, which creates the pending `tenantMembers` row and
 * has 3pm-auth send the invite email. On accept + SSO login the auth callback
 * activates the membership (existing flow — nothing new to build there).
 *
 * Mirrors the dispatch portal's staff-import flow, adapted to AM's `inviteUser`
 * mechanics ({data,error} result; duplicate-email = already a member).
 */

import { ObjectId } from 'mongodb';
import {
  getTenantMembersCollection,
  getInvitationsCollection,
  getRolesCollection,
  getDriversCollection,
} from '@/lib/mongodb';
import { getCommandStaff, type CommandStaff } from '@/lib/command/fetchers';
import { describeCommandFailure } from '@/lib/command/types';
import { commandStaffDriverFields } from '@/controller/command-connection/driver-mapping';
import { inviteUser } from './index';

export interface CommandStaffDirectoryItem extends CommandStaff {
  /** Already a member of this tenant (matched by email). */
  alreadyMember: boolean;
  /** Already has a pending/invited invitation. */
  alreadyInvited: boolean;
  /** Can be invited now (has an email and isn't already a member). */
  invitable: boolean;
}

export interface CommandStaffImportSummary {
  invited: number;
  /** Of the invited: how many also got a driver profile (Driver role). */
  driversCreated: number;
  skippedNoEmail: number;
  skippedAlreadyMember: number;
  failed: number;
  errors: string[];
}

/** Per-person import selection: which Command staff member gets which AM role. */
export interface CommandStaffAssignment {
  /** Command staff id. */
  id: string;
  /** AM role to assign on invite (per person — Driver, Mechanic, Admin, ...). */
  roleId: string;
}

/**
 * Resolve the default role for imported members: prefer an explicit Member/Staff
 * role, else the first non-Admin (non-system) role, else any role. Returns null
 * only when the tenant has no roles at all.
 */
async function resolveMemberRoleId(tenantOid: ObjectId): Promise<string | null> {
  const roles = await getRolesCollection();
  const base = { tenantId: tenantOid, isArchived: { $ne: true } };
  const preferred = await roles.findOne({ ...base, nameLower: { $in: ['member', 'staff'] } });
  if (preferred) return preferred._id.toString();
  const nonAdmin = await roles.findOne({ ...base, isSystem: { $ne: true } });
  if (nonAdmin) return nonAdmin._id.toString();
  const any = await roles.findOne(base);
  return any ? any._id.toString() : null;
}

/** Command staff annotated with their AM membership/invite status. */
export async function commandStaffDirectory(
  tenantId: string,
  authTenantId: string,
): Promise<
  | { ok: true; items: CommandStaffDirectoryItem[] }
  | { ok: false; error: string; status: number }
> {
  const res = await getCommandStaff(authTenantId);
  if (!res.ok) {
    return {
      ok: false,
      error: describeCommandFailure(res, 'load staff'),
      status: res.reason === 'unreachable' ? 503 : 502,
    };
  }

  const staff = res.data;
  const emails = staff.map((s) => s.email).filter((e): e is string => !!e);
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const [membersCol, invitesCol] = await Promise.all([
    getTenantMembersCollection(),
    getInvitationsCollection(),
  ]);
  const [memberDocs, inviteDocs] = await Promise.all([
    emails.length
      ? membersCol.find({ tenantId: tenantOid, email: { $in: emails } }, { projection: { email: 1 } }).toArray()
      : Promise.resolve([]),
    emails.length
      ? invitesCol
          .find(
            { tenantId: tenantOid, email: { $in: emails }, status: { $in: ['pending', 'invited'] } },
            { projection: { email: 1 } },
          )
          .toArray()
      : Promise.resolve([]),
  ]);
  const memberEmails = new Set(memberDocs.map((m) => String(m.email).toLowerCase()));
  const invitedEmails = new Set(inviteDocs.map((i) => String(i.email).toLowerCase()));

  const items = staff.map((s) => {
    const alreadyMember = !!s.email && memberEmails.has(s.email);
    const alreadyInvited = !!s.email && invitedEmails.has(s.email);
    return { ...s, alreadyMember, alreadyInvited, invitable: !!s.email && !alreadyMember };
  });

  return { ok: true, items };
}

/**
 * Invite the selected Command staff as members with a PER-PERSON role choice
 * (Driver, Mechanic, Admin, ... — whatever AM roles the tenant has). Re-fetches
 * staff from Command so names/emails are trusted (not client-supplied). Returns
 * a per-outcome summary; "already a member" (duplicate email) is a skip, not a
 * fail.
 *
 * When the assigned role is a Driver role, the person ALSO gets a driver
 * profile record — created/updated from the Command staff data via the shared
 * mapper (licence number, DOB, phones, employee number, photo) and linked to
 * the new membership, so imported drivers arrive with their details complete.
 */
export async function importCommandStaff(
  tenantId: string,
  userId: string,
  authTenantId: string,
  assignments: CommandStaffAssignment[],
): Promise<
  | { ok: true; summary: CommandStaffImportSummary }
  | { ok: false; error: string; status: number }
> {
  const res = await getCommandStaff(authTenantId);
  if (!res.ok) {
    return {
      ok: false,
      error: describeCommandFailure(res, 'import staff'),
      status: res.reason === 'unreachable' ? 503 : 502,
    };
  }

  const tenantOid = ObjectId.createFromHexString(tenantId);

  // Resolve the requested roles once (tenant-scoped) so we know which
  // assignments are valid and which roles are Driver roles.
  const requestedRoleIds = Array.from(
    new Set(assignments.map((a) => a.roleId).filter((id) => ObjectId.isValid(id))),
  );
  const rolesCol = await getRolesCollection();
  const roleDocs = requestedRoleIds.length
    ? await rolesCol
        .find(
          {
            _id: { $in: requestedRoleIds.map((id) => ObjectId.createFromHexString(id)) },
            tenantId: tenantOid,
            isArchived: { $ne: true },
          },
          { projection: { isDriver: 1, nameLower: 1 } },
        )
        .toArray()
    : [];
  const rolesById = new Map(
    roleDocs.map((r) => [
      r._id.toString(),
      { isDriver: r.isDriver === true || r.nameLower === 'driver' },
    ]),
  );
  const fallbackRoleId = await resolveMemberRoleId(tenantOid);

  const staffById = new Map(res.data.map((s) => [s.id, s]));
  const summary: CommandStaffImportSummary = {
    invited: 0,
    driversCreated: 0,
    skippedNoEmail: 0,
    skippedAlreadyMember: 0,
    failed: 0,
    errors: [],
  };

  for (const assignment of assignments) {
    const s = staffById.get(assignment.id);
    if (!s) continue; // unknown/stale id from the client — ignore
    if (!s.email) {
      summary.skippedNoEmail += 1;
      continue;
    }

    const role = rolesById.get(assignment.roleId);
    const roleId = role ? assignment.roleId : fallbackRoleId;
    if (!roleId) {
      summary.failed += 1;
      summary.errors.push(`${s.name || s.email}: no valid role to assign`);
      continue;
    }

    const parts = s.name.trim().split(/\s+/).filter(Boolean);
    const firstName = s.firstName || parts[0] || s.name || 'Staff';
    // AM requires a non-empty last name; fall back to the remaining name words,
    // else the first name (single-word names) so the invite validates.
    const lastName = s.lastName || parts.slice(1).join(' ') || firstName;

    const r = await inviteUser(tenantId, userId, {
      firstName,
      lastName,
      email: s.email,
      roleId,
      mobileNumber: s.phone || undefined,
    });

    if (r.error) {
      const err = r.error as Record<string, string> | string;
      const emailErr = typeof err === 'object' && err ? err.email : undefined;
      if (emailErr && /already exists/i.test(emailErr)) {
        summary.skippedAlreadyMember += 1;
      } else {
        summary.failed += 1;
        const msg =
          typeof err === 'string'
            ? err
            : emailErr || Object.values(err ?? {})[0] || 'invite failed';
        summary.errors.push(`${s.name || s.email}: ${msg}`);
      }
      continue;
    }

    summary.invited += 1;

    // Driver role → also materialize the driver profile from Command data.
    if (role?.isDriver) {
      try {
        const memberId = (r.data as { id?: string } | null)?.id;
        await upsertDriverProfileForImport(
          tenantOid,
          ObjectId.createFromHexString(userId),
          s,
          memberId && ObjectId.isValid(memberId)
            ? ObjectId.createFromHexString(memberId)
            : undefined,
        );
        summary.driversCreated += 1;
      } catch (driverErr) {
        // Membership + invite already succeeded — surface but don't fail the row.
        console.error(`[importCommandStaff] driver profile failed for ${s.email}:`, driverErr);
        summary.errors.push(`${s.name || s.email}: invited, but driver profile failed`);
      }
    }
  }

  return { ok: true, summary };
}

/**
 * Create/refresh the driver record for a Command staff member imported with a
 * Driver role, linking it to the created membership. Match order: existing
 * Command linkage (commandStaffId) → email — never duplicates a person.
 */
async function upsertDriverProfileForImport(
  tenantOid: ObjectId,
  createdByOid: ObjectId,
  s: CommandStaff,
  tenantMemberId?: ObjectId,
): Promise<void> {
  const driversCol = await getDriversCollection();
  const now = new Date();
  const match: Record<string, unknown>[] = [{ commandStaffId: s.id }];
  if (s.email) match.push({ email: s.email });

  await driversCol.updateOne(
    { tenantId: tenantOid, $or: match },
    {
      $set: {
        ...commandStaffDriverFields(s, now),
        ...(tenantMemberId ? { tenantMemberId } : {}),
        updatedBy: createdByOid,
        updatedAt: now,
      },
      $setOnInsert: {
        tenantId: tenantOid,
        createdBy: createdByOid,
        createdAt: now,
        isActive: true,
        isArchived: false,
      },
    },
    { upsert: true },
  );
}
