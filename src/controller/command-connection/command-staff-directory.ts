/**
 * Import Command staff as portal Users or Drivers.
 *
 * Command staff are HR records; asset-manager users must be login identities
 * (tenantMembers). This module bridges the two:
 *
 * 1. `commandStaffDirectory` — fetches staff from Command and annotates each
 *    with their local membership/invitation/driver status.
 * 2. `importCommandStaffAsUsers` — invites selected staff as portal users
 *    (tenantMembers with a chosen role + 3PM invitation email).
 * 3. `importCommandStaffAsDrivers` — imports selected staff as driver records
 *    with linked tenantMembers + invitation emails.
 *
 * Mirrors 3pm-dispatch-portal/controller/staffInvitations/command-import.ts.
 */

import { ObjectId } from 'mongodb';
import {
  getTenantMembersCollection,
  getInvitationsCollection,
  getDriversCollection,
  getUsersCollection,
  getTenantsCollection,
  getRolesCollection,
} from '@/lib/mongodb';
import { getCommandStaff, type CommandStaff } from '@/lib/command/fetchers';
import { inviteUser } from '@/controller/users';
import { createInvitation } from '@/controller/invitations';
import { sendInvitationEmail } from '@/lib/email';

// ── Types ────────────────────────────────────────────────────────────────

export interface CommandStaffDirectoryItem extends CommandStaff {
  /** Already a tenantMember of this tenant (matched by email). */
  alreadyMember: boolean;
  /** Has a pending invitation already. */
  alreadyInvited: boolean;
  /** Already imported as a driver. */
  alreadyDriver: boolean;
  /** Can be invited now (has an email and isn't already a member). */
  invitable: boolean;
}

export interface UserImportSummary {
  invited: number;
  skippedNoEmail: number;
  skippedAlreadyMember: number;
  failed: number;
  errors: string[];
}

export interface DriverImportSummary {
  created: number;
  linked: number;
  skippedAlreadyDriver: number;
  skippedNoName: number;
  failed: number;
  errors: string[];
}

// ── Step 1: Browse Command staff ─────────────────────────────────────────

/**
 * Fetch Command staff annotated with local membership/invitation/driver status.
 * Used by the "Import from Command" picker in both Users and Drivers pages.
 */
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

  const [membersCol, invitationsCol, driversCol] = await Promise.all([
    getTenantMembersCollection(),
    getInvitationsCollection(),
    getDriversCollection(),
  ]);

  const [memberDocs, inviteDocs, driverDocs] = await Promise.all([
    emails.length
      ? membersCol.find({ tenantId: tenantOid, email: { $in: emails } }, { projection: { email: 1 } }).toArray()
      : Promise.resolve([]),
    emails.length
      ? invitationsCol
          .find(
            { tenantId: tenantOid, email: { $in: emails }, status: { $in: ['pending', 'invited'] } },
            { projection: { email: 1 } },
          )
          .toArray()
      : Promise.resolve([]),
    driversCol
      .find(
        {
          tenantId: tenantOid,
          $or: [
            ...(emails.length ? [{ email: { $in: emails } }] : []),
            { commandStaffId: { $in: staff.map((s) => s.id) } },
          ],
        },
        { projection: { email: 1, commandStaffId: 1 } },
      )
      .toArray(),
  ]);

  const memberEmails = new Set(memberDocs.map((m) => String(m.email).toLowerCase()));
  const invitedEmails = new Set(inviteDocs.map((i) => String(i.email).toLowerCase()));
  const driverStaffIds = new Set(driverDocs.map((d) => d.commandStaffId as string).filter(Boolean));
  const driverEmails = new Set(
    driverDocs.map((d) => (d.email ? String(d.email).toLowerCase() : null)).filter(Boolean) as string[],
  );

  const items: CommandStaffDirectoryItem[] = staff.map((s) => {
    const alreadyMember = !!s.email && memberEmails.has(s.email);
    const alreadyInvited = !!s.email && invitedEmails.has(s.email);
    const alreadyDriver = driverStaffIds.has(s.id) || (!!s.email && driverEmails.has(s.email));
    return {
      ...s,
      alreadyMember,
      alreadyInvited,
      alreadyDriver,
      invitable: !!s.email && !alreadyMember,
    };
  });

  return { ok: true, items };
}

// ── Step 2a: Import selected staff as portal Users ───────────────────────

/**
 * Invite selected Command staff as portal users (tenantMembers).
 * Re-fetches staff from Command so names/emails are trusted (not client-supplied).
 * Calls the existing `inviteUser()` which handles:
 *   tenantMember creation → 3PM pre-register → 3PM invitation email → local mirror
 */
export async function importCommandStaffAsUsers(
  tenantId: string,
  invitedByUserId: string,
  authTenantId: string,
  ids: string[],
  roleId: string,
): Promise<
  | { ok: true; summary: UserImportSummary }
  | { ok: false; error: string; status: number }
> {
  const res = await getCommandStaff(authTenantId);
  if (!res.ok) {
    return { ok: false, error: "Couldn't reach Command to import staff.", status: 503 };
  }

  const wanted = new Set(ids);
  const selected = res.data.filter((s) => wanted.has(s.id));
  const summary: UserImportSummary = {
    invited: 0,
    skippedNoEmail: 0,
    skippedAlreadyMember: 0,
    failed: 0,
    errors: [],
  };

  for (const s of selected) {
    if (!s.email) {
      summary.skippedNoEmail++;
      continue;
    }

    const parts = s.name.split(/\s+/);
    const firstName = s.firstName || parts[0] || s.name || 'Staff';
    const lastName = s.lastName || parts.slice(1).join(' ') || '';

    const result = await inviteUser(tenantId, invitedByUserId, {
      firstName,
      lastName,
      email: s.email,
      roleId,
      mobileNumber: s.phone || undefined,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = (result as any).error;
    if (err) {
      // Check if it's a duplicate email error (already a member)
      const errorMsg =
        typeof err === 'object' && err.email
          ? String(err.email)
          : typeof err === 'string'
            ? err
            : JSON.stringify(err);

      if (errorMsg.includes('already exists')) {
        summary.skippedAlreadyMember++;
      } else {
        summary.failed++;
        summary.errors.push(`${s.name || s.email}: ${errorMsg}`);
      }
    } else {
      summary.invited++;
    }
  }

  return { ok: true, summary };
}

// ── Step 2b: Import selected staff as Drivers ────────────────────────────

/**
 * Import selected Command staff as drivers with linked tenantMembers and
 * invitation emails. Creates the driver record, links a tenantMember with
 * the Driver role, and sends an invitation email if the person has an email.
 */
export async function importCommandStaffAsDrivers(
  tenantId: string,
  userId: string,
  authTenantId: string,
  ids: string[],
): Promise<
  | { ok: true; summary: DriverImportSummary }
  | { ok: false; error: string; status: number }
> {
  const res = await getCommandStaff(authTenantId);
  if (!res.ok) {
    return { ok: false, error: "Couldn't reach Command to import staff.", status: 503 };
  }

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);
  const driversCol = await getDriversCollection();

  const wanted = new Set(ids);
  const selected = res.data.filter((s) => wanted.has(s.id));
  const summary: DriverImportSummary = {
    created: 0,
    linked: 0,
    skippedAlreadyDriver: 0,
    skippedNoName: 0,
    failed: 0,
    errors: [],
  };

  for (const s of selected) {
    if (!s.firstName && !s.lastName && !s.email) {
      summary.skippedNoName++;
      continue;
    }

    const firstName = s.firstName || s.name || 'Unknown';
    const lastName = s.lastName || '';
    const now = new Date();

    try {
      // 1. Upsert driver record (same logic as importDrivers in import.ts)
      const match: Record<string, unknown>[] = [{ commandStaffId: s.id }];
      if (s.email) match.push({ email: s.email });

      const driverResult = await driversCol.updateOne(
        { tenantId: tenantOid, $or: match },
        {
          $set: {
            commandStaffId: s.id,
            source: 'command',
            firstName,
            lastName,
            ...(s.email ? { email: s.email } : {}),
            ...(s.phone ? { mobileNumber: s.phone } : {}),
            commandSyncedAt: now,
            updatedBy: userOid,
            updatedAt: now,
          },
          $setOnInsert: {
            tenantId: tenantOid,
            createdBy: userOid,
            createdAt: now,
            isActive: true,
            isArchived: false,
          },
        },
        { upsert: true },
      );

      const isNew = driverResult.upsertedCount > 0;

      // 2. Find the driver doc to get its _id
      const driverDoc = await driversCol.findOne({
        tenantId: tenantOid,
        $or: match,
      });

      if (!driverDoc) {
        summary.failed++;
        summary.errors.push(`${s.name || s.email}: driver upsert succeeded but doc not found`);
        continue;
      }

      // 3. Create tenantMember + user if not already linked
      if (!driverDoc.tenantMemberId) {
        try {
          const { tenantMemberId, roleId, alreadyActive } = await createTenantMemberForDriverImport(
            tenantOid,
            userOid,
            now,
            { firstName, lastName, email: s.email || undefined },
          );

          // Link driver to tenantMember
          await driversCol.updateOne(
            { _id: driverDoc._id },
            { $set: { tenantMemberId } },
          );

          // 4. Send invitation email if driver has email and isn't already
          //    an active member (an existing user needs no invitation).
          if (s.email && !alreadyActive) {
            try {
              const { rawToken } = await createInvitation(tenantId, {
                email: s.email,
                firstName,
                lastName,
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
                recipientEmail: s.email,
                recipientName: firstName,
                inviterName,
                tenantName,
                roleName: 'Driver',
                acceptUrl,
              });
            } catch (emailErr) {
              console.error(`[command-import] Failed to send invitation for ${s.email}:`, emailErr);
            }
          }

          summary.linked++;
        } catch (memberErr) {
          console.error(`[command-import] Failed to create tenantMember for driver ${s.name}:`, memberErr);
          // Driver was still created/updated — just without member link
        }
      }

      if (isNew) summary.created++;
      else if (!driverDoc.tenantMemberId) {
        // Was updated and newly linked — already counted in linked
      } else {
        summary.skippedAlreadyDriver++;
      }
    } catch (err) {
      summary.failed++;
      summary.errors.push(
        `${s.name || s.email}: ${err instanceof Error ? err.message : 'Import failed'}`,
      );
    }
  }

  return { ok: true, summary };
}

// ── Internal helper ──────────────────────────────────────────────────────

/**
 * Create user + tenantMember for a driver import (mirrors createTenantMemberForDriver
 * from drivers controller but is self-contained for the import context).
 */
async function createTenantMemberForDriverImport(
  tenantOid: ObjectId,
  createdByOid: ObjectId,
  now: Date,
  driver: { firstName: string; lastName: string; email?: string },
): Promise<{ tenantMemberId: ObjectId; roleId: ObjectId; alreadyActive: boolean }> {
  const usersCol = await getUsersCollection();
  const tenantMembersCol = await getTenantMembersCollection();

  // 1. Resolve the Driver role
  const driverRoleId = await resolveDriverRoleIdForImport(tenantOid, createdByOid);

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

  // 3. Upsert tenantMember — unique on (userId, tenantId).
  // Never downgrade an existing active/portal member to the pending Driver
  // framing — just refresh names and reuse the membership (no invite email).
  const existingMember = await tenantMembersCol.findOne({
    userId: localUserId,
    tenantId: tenantOid,
  });
  if (existingMember && (existingMember.status === 'active' || existingMember.portalUser === true)) {
    await tenantMembersCol.updateOne(
      { _id: existingMember._id },
      { $set: { firstName: driver.firstName, lastName: driver.lastName, updatedAt: now } },
    );
    return {
      tenantMemberId: existingMember._id as ObjectId,
      roleId: (existingMember.roleId as ObjectId) ?? driverRoleId,
      alreadyActive: true,
    };
  }

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

  return { tenantMemberId: tmResult!._id as ObjectId, roleId: driverRoleId, alreadyActive: false };
}

/**
 * Resolve (or auto-create) the "Driver" role for a tenant.
 * Same logic as resolveDriverRoleId in drivers controller.
 */
async function resolveDriverRoleIdForImport(
  tenantOid: ObjectId,
  createdByOid: ObjectId,
): Promise<ObjectId> {
  const rolesCol = await getRolesCollection();
  const now = new Date();

  // Match by key OR nameLower — seeded system Driver roles only carry
  // nameLower; a key-only miss would collide with the unique
  // {tenantId, nameLower} index on insert.
  const existing = await rolesCol.findOne({
    tenantId: tenantOid,
    $or: [{ key: 'driver' }, { nameLower: 'driver' }],
    isArchived: { $ne: true },
  });

  if (existing) return existing._id as ObjectId;

  const result = await rolesCol.insertOne({
    tenantId: tenantOid,
    name: 'Driver',
    key: 'driver',
    nameLower: 'driver',
    description: 'Mobile-only access for completing inspections.',
    permissions: {
      v: 2,
      forms: [
        { id: 'inspections.inspectionHistory.inspection', v: 'ALL', c: false, e: false },
      ],
      m: ['inspections'],
      sm: ['inspections.inspectionHistory'],
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
