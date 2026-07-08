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
} from '@/lib/mongodb';
import { getCommandStaff, type CommandStaff } from '@/lib/command/fetchers';
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
  skippedNoEmail: number;
  skippedAlreadyMember: number;
  failed: number;
  errors: string[];
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
    return { ok: false, error: "Couldn't reach Command to load staff.", status: 503 };
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
 * Invite the selected Command staff (by Command staff id) as members. Re-fetches
 * staff from Command so names/emails are trusted (not client-supplied). Returns a
 * per-outcome summary; "already a member" (duplicate email) is a skip, not a fail.
 */
export async function importCommandStaff(
  tenantId: string,
  userId: string,
  authTenantId: string,
  ids: string[],
  roleId?: string,
): Promise<
  | { ok: true; summary: CommandStaffImportSummary }
  | { ok: false; error: string; status: number }
> {
  const res = await getCommandStaff(authTenantId);
  if (!res.ok) {
    return { ok: false, error: "Couldn't reach Command to import staff.", status: 503 };
  }

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const resolvedRoleId =
    roleId && ObjectId.isValid(roleId) ? roleId : await resolveMemberRoleId(tenantOid);
  if (!resolvedRoleId) {
    return { ok: false, error: 'No role available to assign. Create a role first.', status: 400 };
  }

  const wanted = new Set(ids);
  const selected = res.data.filter((s) => wanted.has(s.id));
  const summary: CommandStaffImportSummary = {
    invited: 0,
    skippedNoEmail: 0,
    skippedAlreadyMember: 0,
    failed: 0,
    errors: [],
  };

  for (const s of selected) {
    if (!s.email) {
      summary.skippedNoEmail += 1;
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
      roleId: resolvedRoleId,
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
    } else {
      summary.invited += 1;
    }
  }

  return { ok: true, summary };
}
