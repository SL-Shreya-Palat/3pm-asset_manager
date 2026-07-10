/**
 * Auto-provisioning of local MongoDB records during 3pm-auth SSO callback.
 *
 * When a user logs in via 3pm-auth for the first time, this module creates
 * (or updates) the local `users`, `tenants`, `roles`, and `tenantMembers`
 * documents so that the rest of the application can resolve auth context locally.
 */
import { ObjectId } from 'mongodb';
import {
  getUsersCollection,
  getTenantsCollection,
  getTenantMembersCollection,
  getRolesCollection,
} from '@/lib/mongodb';
import { seedSystemRoles } from '@/lib/system-roles';
import { seedInspectionForms } from '@/controller/seeding';
import { seedWorkOrderStatuses } from '@/controller/work-order-statuses';

interface ProvisioningInput {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    profilePicUrl?: string;
  };
  tenant?: {
    id: string;
    name: string;
    slug: string;
    role: string;
  };
  /** When set, skip provisioning the user's own (owner) tenant from 3pm-auth.
   *  Instead, activate the pending tenantMember on this invited tenant. */
  invitedTenantId?: string;
  /** Role from the accepted invitation — used when creating a new tenantMember
   *  for an invited user whose pending member wasn't pre-created. */
  invitedRoleId?: string;
}

interface ProvisioningResult {
  localUserId: ObjectId;
  localTenantId: ObjectId | null;
}

/** Map 3pm-auth role string to local role name and metadata. */
function mapAuthRole(authRole: string): {
  name: string;
  isSystem: boolean;
  type: 'system' | 'custom';
  description: string;
} {
  switch (authRole) {
    case 'owner':
      return { name: 'Owner', isSystem: true, type: 'system', description: 'Tenant owner — full access' };
    case 'admin':
      return { name: 'Admin', isSystem: true, type: 'system', description: 'Administrator — full access' };
    default:
      return { name: 'Member', isSystem: false, type: 'custom', description: 'Standard member' };
  }
}

/**
 * Upsert local user, tenant, role, and tenantMember records from 3pm-auth data.
 *
 * - User: matched by `authUserId`, with email fallback for pre-existing records.
 * - Tenant: matched by `authTenantId`.
 * - Role: matched by `(tenantId, nameLower)`.
 * - TenantMember: matched by compound `(userId, tenantId)`.
 *
 * Non-fatal: logs errors and returns null on failure so the callback can
 * still set cookies and redirect. The user will have a valid JWT even if
 * local provisioning fails.
 */
export async function ensureLocalRecords(
  input: ProvisioningInput,
): Promise<ProvisioningResult | null> {
  try {
    if (!input.user.id || !ObjectId.isValid(input.user.id)) {
      console.warn('[provisioning] Invalid 3pm user id:', input.user.id);
      return null;
    }

    const usersCollection = await getUsersCollection();
    const authUserId = ObjectId.createFromHexString(input.user.id);
    const normalizedEmail = input.user.email.toLowerCase().trim();
    const now = new Date();

    // ── 1. Upsert user ──────────────────────────────────────────────
    // Check by authUserId first, then by email (handles pre-existing records
    // created before 3pm-auth was integrated).
    let existingUser = await usersCollection.findOne({ authUserId });
    if (!existingUser) {
      existingUser = await usersCollection.findOne({ email: normalizedEmail });
    }

    const userResult = await usersCollection.findOneAndUpdate(
      existingUser ? { _id: existingUser._id } : { authUserId },
      {
        $set: {
          authUserId,
          email: normalizedEmail,
          firstName: input.user.firstName,
          lastName: input.user.lastName,
          profileImageUrl: input.user.profilePicUrl || null,
          lastLoginAt: now,
          updatedAt: now,
        },
        $setOnInsert: {
          phoneNumber: null,
          isActive: true,
          emailVerified: true,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );

    if (!userResult) {
      console.error('[provisioning] User upsert returned null');
      return null;
    }

    const localUserId = userResult._id as ObjectId;

    // ── 2. Tenant + role + tenantMember provisioning ─────────────────
    let localTenantId: ObjectId | null = null;

    if (input.invitedTenantId && ObjectId.isValid(input.invitedTenantId)) {
      // ── INVITATION FLOW ──────────────────────────────────────────
      // User is logging in after accepting an invitation.
      // Skip creating their personal (owner) tenant from 3pm-auth.
      // Instead, activate (or create) the tenantMember on the invited tenant.
      // Mirrors the construction portal's completePending3PMInvitationFromAccept().
      const invitedTenantOid = ObjectId.createFromHexString(input.invitedTenantId);
      const tenantMembersCollection = await getTenantMembersCollection();

      // Try finding the member — prefer status='pending' but also match
      // members created without a status (e.g. driver flow before the fix).
      let existingMember = await tenantMembersCollection.findOne({
        tenantId: invitedTenantOid,
        email: normalizedEmail,
        status: 'pending',
      });

      if (!existingMember) {
        existingMember = await tenantMembersCollection.findOne({
          tenantId: invitedTenantOid,
          email: normalizedEmail,
        });
      }

      if (existingMember) {
        // Activate the existing member
        await tenantMembersCollection.updateOne(
          { _id: existingMember._id },
          {
            $set: {
              userId: localUserId,
              firstName: input.user.firstName,
              lastName: input.user.lastName,
              email: normalizedEmail,
              isActive: true,
              portalUser: true,
              status: 'active',
              updatedAt: now,
            },
          },
        );
        localTenantId = invitedTenantOid;
        console.log(
          `[provisioning] Activated invitation member — member=${existingMember._id} tenant=${invitedTenantOid}`,
        );
      } else {
        // No member exists yet — create one so the user lands in the invited
        // tenant. This covers edge cases where the tenantMember wasn't
        // pre-created at invitation time.
        const roleId =
          input.invitedRoleId && ObjectId.isValid(input.invitedRoleId)
            ? ObjectId.createFromHexString(input.invitedRoleId)
            : null;

        await tenantMembersCollection.insertOne({
          userId: localUserId,
          tenantId: invitedTenantOid,
          firstName: input.user.firstName,
          lastName: input.user.lastName,
          email: normalizedEmail,
          ...(roleId ? { roleId } : {}),
          isActive: true,
          portalUser: true,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        localTenantId = invitedTenantOid;
        console.log(
          `[provisioning] Created new member for invitation — tenant=${invitedTenantOid}`,
        );
      }
    } else if (input.tenant?.id && ObjectId.isValid(input.tenant.id)) {
      // ── NORMAL FLOW (no pending invitation) ──────────────────────
      // Before creating a new tenant from 3pm-auth data, check if the user
      // already has active tenant memberships (e.g. from a completed
      // invitation). If so, use that tenant instead of creating a personal
      // one. This prevents invited users from getting a second (personal)
      // tenant on subsequent logins. Mirrors the construction portal pattern
      // where `hasPendingInviteForLogin` skips owner tenant sync.
      const tenantMembersCollection = await getTenantMembersCollection();
      const existingMembership = await tenantMembersCollection.findOne({
        userId: localUserId,
        isActive: true,
        status: 'active',
      });

      if (existingMembership) {
        localTenantId = existingMembership.tenantId as ObjectId;
        // Sync system roles even for returning users so that code-level
        // permission changes propagate to the database.
        await seedSystemRoles(localTenantId, localUserId);
        console.log(
          `[provisioning] User already has active membership — using existing tenant=${localTenantId}`,
        );
      } else {
        // Provision the user's own tenant from 3pm-auth.
        const tenantsCollection = await getTenantsCollection();
        const authTenantId = ObjectId.createFromHexString(input.tenant.id);
        const isOwner = input.tenant.role === 'owner';

        const tenantResult = await tenantsCollection.findOneAndUpdate(
          { authTenantId },
          {
            $set: {
              name: input.tenant.name,
              ...(isOwner ? { ownerId: localUserId, authOwnerId: authUserId } : {}),
              updatedAt: now,
            },
            $setOnInsert: {
              authTenantId,
              description: `Tenant for ${normalizedEmail}`,
              logoUrl: null,
              isActive: true,
              createdAt: now,
              ...(!isOwner ? { ownerId: null, authOwnerId: null } : {}),
            },
          },
          { upsert: true, returnDocument: 'after' },
        );

        if (tenantResult) {
          localTenantId = tenantResult._id as ObjectId;
        }

        // ── Seed canonical system roles (Admin / Manager / Driver) ───
        // Always available once the org exists. Idempotent.
        if (localTenantId) {
          await seedSystemRoles(localTenantId, localUserId);
        }

        // ── 3. Upsert role ──────────────────────────────────────────
        let roleId: ObjectId | null = null;

        if (localTenantId && input.tenant?.role) {
          const rolesCollection = await getRolesCollection();
          const roleInfo = mapAuthRole(input.tenant.role);
          const nameLower = roleInfo.name.toLowerCase();

          const roleResult = await rolesCollection.findOneAndUpdate(
            { tenantId: localTenantId, nameLower },
            {
              $set: {
                updatedAt: now,
                type: roleInfo.type,
              },
              $setOnInsert: {
                tenantId: localTenantId,
                name: roleInfo.name,
                nameLower,
                description: roleInfo.description,
                permissions: { v: 2, forms: ['*'], m: ['*'], sm: [] },
                teamScoped: false,
                mobileOnly: false,
                isSystem: roleInfo.isSystem,
                isAdmin: nameLower === 'owner' || nameLower === 'admin' ? true : null,
                isActive: true,
                createdAt: now,
              },
            },
            { upsert: true, returnDocument: 'after' },
          );

          if (roleResult) {
            roleId = roleResult._id as ObjectId;
          }
        }

        // ── 4. Upsert tenantMember ──────────────────────────────────
        if (localTenantId) {
          const tenantMembersCol = await getTenantMembersCollection();

          await tenantMembersCol.findOneAndUpdate(
            { userId: localUserId, tenantId: localTenantId },
            {
              $set: {
                firstName: input.user.firstName,
                lastName: input.user.lastName,
                email: normalizedEmail,
                isActive: true,
                portalUser: true,
                status: 'active',
                updatedAt: now,
              },
              $setOnInsert: {
                userId: localUserId,
                tenantId: localTenantId,
                ...(roleId ? { roleId } : {}),
                createdAt: now,
              },
            },
            { upsert: true },
          );
        }
      }
    }

    // ── Backfill the user's phone from their tenant membership ───────────
    // Invited users have their mobile captured on the tenantMember at invite
    // time, but the users record is created from the 3pm-auth session (which
    // carries no phone), so `phoneNumber` starts blank and the Profile shows
    // nothing. Copy the member's mobile into the users record once, while it's
    // still empty (never clobbering a phone the user later set). Runs for BOTH
    // the invitation and normal flows, so it also self-heals users invited
    // before this fix on their next login. Non-fatal.
    if (localTenantId) {
      try {
        const membersCol = await getTenantMembersCollection();
        const member = await membersCol.findOne({ userId: localUserId, tenantId: localTenantId });
        const memberMobile = member?.mobileNumber as string | undefined;
        if (memberMobile) {
          await usersCollection.updateOne(
            {
              _id: localUserId,
              $or: [{ phoneNumber: null }, { phoneNumber: '' }, { phoneNumber: { $exists: false } }],
            },
            { $set: { phoneNumber: memberMobile, updatedAt: now } },
          );
        }
      } catch (err) {
        console.error('[provisioning] Phone backfill failed (non-fatal):', err);
      }
    }

    // ── Seed pre-start inspection forms for the org (self-healing) ────
    // Ensures every org has the standard pre-start forms — including the
    // daily "Driver Wellness Pre-Start Check" the driver fills before
    // starting work. Runs for BOTH the new-tenant (onboarding) and
    // returning-user branches, so orgs that onboarded before this was
    // wired up get the forms on the owner/member's next login. Excluded
    // for the invitation flow (`invitedTenantId`) — the host org already
    // seeded it, and invited users may be mobile-only drivers.
    // Idempotent (a cheap indexed query skips already-seeded forms with no
    // form-builder calls) and non-fatal: a form-builder outage must not
    // block login, and the lazy seed-prestart triggers remain as a fallback.
    if (localTenantId && !input.invitedTenantId) {
      try {
        await seedInspectionForms({
          tenantId: localTenantId.toHexString(),
          userId: localUserId.toHexString(),
          userEmail: normalizedEmail,
          userName:
            `${input.user.firstName || ''} ${input.user.lastName || ''}`.trim() ||
            normalizedEmail,
        });
      } catch (seedErr) {
        console.error(
          '[provisioning] Prestart form seeding failed (non-fatal):',
          seedErr,
        );
      }

      // Seed the default work order statuses for a brand-new tenant.
      // Idempotent (skips when the tenant already has statuses) and non-fatal.
      try {
        await seedWorkOrderStatuses(
          localTenantId.toHexString(),
          localUserId.toHexString(),
        );
      } catch (seedErr) {
        console.error(
          '[provisioning] Work order status seeding failed (non-fatal):',
          seedErr,
        );
      }
    }

    console.log(
      `[provisioning] OK — user=${localUserId} tenant=${localTenantId}`,
    );
    return { localUserId, localTenantId };
  } catch (error) {
    console.error('[provisioning] Failed to ensure local records:', error);
    return null;
  }
}
