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
 * Upsert one local tenant + its role + the caller's membership from 3pm-auth
 * tenant data. Single source of truth for tenant provisioning, shared by the
 * normal single-tenant callback flow AND the tenant-list flow (used when token
 * exchange returned no tenant), so the two paths can never drift. Idempotent.
 * Returns the local tenant `_id`, or null if the tenant upsert failed.
 */
async function upsertTenantRoleAndMember(
  localUserId: ObjectId,
  authUserId: ObjectId,
  tenantInfo: { id: string; name: string; role?: string },
  user: { firstName: string; lastName: string },
  normalizedEmail: string,
  now: Date,
): Promise<ObjectId | null> {
  const tenantsCollection = await getTenantsCollection();
  const authTenantId = ObjectId.createFromHexString(tenantInfo.id);
  const isOwner = tenantInfo.role === 'owner';

  const tenantResult = await tenantsCollection.findOneAndUpdate(
    { authTenantId },
    {
      $set: {
        name: tenantInfo.name,
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

  const localTenantId = (tenantResult?._id as ObjectId) ?? null;
  if (!localTenantId) return null;

  // Seed canonical system roles (Admin / Manager / Driver). Idempotent.
  await seedSystemRoles(localTenantId, localUserId);

  // A tenantMember may already exist for this (tenant, email) with no userId
  // yet — an admin pre-created it (a pending invite, OR directly granting
  // access to someone already a 3pm-auth tenant member — see inviteUser's
  // "already a member" handling for the Command-import case). LINK and
  // activate that EXISTING row, preserving its admin-chosen role/teams,
  // instead of falling through to the fresh-upsert below keyed by
  // {userId, tenantId} — which would miss it entirely (no userId to match
  // yet) and create a DUPLICATE membership with a generic mapped role,
  // orphaning the one the admin actually assigned.
  const tenantMembersCol = await getTenantMembersCollection();
  const existingByEmail = await tenantMembersCol.findOne({
    tenantId: localTenantId,
    email: normalizedEmail,
  });
  if (existingByEmail) {
    await tenantMembersCol.updateOne(
      { _id: existingByEmail._id },
      {
        $set: {
          userId: localUserId,
          firstName: user.firstName,
          lastName: user.lastName,
          isActive: true,
          portalUser: true,
          status: 'active',
          updatedAt: now,
        },
      },
    );
    return localTenantId;
  }

  // Upsert the role matching the 3pm-auth role string.
  let roleId: ObjectId | null = null;
  if (tenantInfo.role) {
    const rolesCollection = await getRolesCollection();
    const roleInfo = mapAuthRole(tenantInfo.role);
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

  // Upsert the tenantMember (no pre-existing row was found above — fresh membership).
  await tenantMembersCol.findOneAndUpdate(
    { userId: localUserId, tenantId: localTenantId },
    {
      $set: {
        firstName: user.firstName,
        lastName: user.lastName,
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

  return localTenantId;
}

/**
 * Upsert the local user record from a 3pm-auth user (matched by authUserId,
 * email fallback for pre-integration records). Returns the local user `_id`.
 * Shared by both provisioning entry points.
 */
async function upsertLocalUser(
  user: ProvisioningInput['user'],
  now: Date,
): Promise<ObjectId | null> {
  const usersCollection = await getUsersCollection();
  const authUserId = ObjectId.createFromHexString(user.id);
  const normalizedEmail = user.email.toLowerCase().trim();

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
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profilePicUrl || null,
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

  return (userResult?._id as ObjectId) ?? null;
}

/**
 * Seed a tenant's default pre-start inspection forms + work order statuses.
 * Idempotent and non-fatal (a form-builder outage must never block login).
 * Shared by both provisioning entry points.
 */
async function seedTenantDefaults(
  localTenantId: ObjectId,
  localUserId: ObjectId,
  userEmail: string,
  userName: string,
): Promise<void> {
  try {
    await seedInspectionForms({
      tenantId: localTenantId.toHexString(),
      userId: localUserId.toHexString(),
      userEmail,
      userName,
    });
  } catch (seedErr) {
    console.error('[provisioning] Prestart form seeding failed (non-fatal):', seedErr);
  }
  try {
    await seedWorkOrderStatuses(localTenantId.toHexString(), localUserId.toHexString());
  } catch (seedErr) {
    console.error('[provisioning] Work order status seeding failed (non-fatal):', seedErr);
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
    const localUserId = await upsertLocalUser(input.user, now);
    if (!localUserId) {
      console.error('[provisioning] User upsert returned null');
      return null;
    }

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
        // Provision the user's own tenant from 3pm-auth (tenant + role + member).
        localTenantId = await upsertTenantRoleAndMember(
          localUserId,
          authUserId,
          { id: input.tenant.id, name: input.tenant.name, role: input.tenant.role },
          { firstName: input.user.firstName, lastName: input.user.lastName },
          normalizedEmail,
          now,
        );
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
      await seedTenantDefaults(
        localTenantId,
        localUserId,
        normalizedEmail,
        `${input.user.firstName || ''} ${input.user.lastName || ''}`.trim() || normalizedEmail,
      );
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

/**
 * Provision local records from the user's FULL 3pm-auth tenant list.
 *
 * The callback's primary path (`ensureLocalRecords`) depends on the single
 * `tenant` object returned by token exchange — which is absent whenever the
 * user has no active app subscription for THIS clientId at token-mint time,
 * silently leaving them with a user record but no tenant/member (the
 * infinite-spinner dead-end). This fallback fetches every tenant the user
 * belongs to (`fetch3PMTenantList`) and provisions them all, so login works as
 * long as the user is a member of ANY active organization. Mirrors
 * construction-portal's syncOwner/MemberTenantsFrom3PM. Idempotent, non-fatal.
 *
 * Returns the CHOSEN default local tenant (the IdP's active tenant when it maps
 * to one we provisioned, else the first), plus the local user id.
 */
export async function ensureLocalRecordsFromTenantList(input: {
  user: ProvisioningInput['user'];
  tenants: Array<{ id: string; name: string; role?: string }>;
  activeTenantId?: string | null;
}): Promise<ProvisioningResult | null> {
  try {
    if (!input.user.id || !ObjectId.isValid(input.user.id)) {
      console.warn('[provisioning] Invalid 3pm user id (list):', input.user.id);
      return null;
    }
    const now = new Date();
    const localUserId = await upsertLocalUser(input.user, now);
    if (!localUserId) {
      console.error('[provisioning] User upsert returned null (list)');
      return null;
    }

    const authUserId = ObjectId.createFromHexString(input.user.id);
    const normalizedEmail = input.user.email.toLowerCase().trim();

    let chosenTenantId: ObjectId | null = null;
    let firstTenantId: ObjectId | null = null;

    for (const t of input.tenants) {
      if (!t?.id || !ObjectId.isValid(t.id)) continue;
      const localTenantId = await upsertTenantRoleAndMember(
        localUserId,
        authUserId,
        { id: t.id, name: t.name, role: t.role },
        { firstName: input.user.firstName, lastName: input.user.lastName },
        normalizedEmail,
        now,
      );
      if (!localTenantId) continue;
      if (!firstTenantId) firstTenantId = localTenantId;
      // The IdP's activeTenantId is a 3pm-auth tenant id === t.id.
      if (input.activeTenantId && t.id === input.activeTenantId) {
        chosenTenantId = localTenantId;
      }
    }

    const localTenantId = chosenTenantId ?? firstTenantId;

    // Seed defaults for the landing tenant only (idempotent, non-fatal).
    if (localTenantId) {
      await seedTenantDefaults(
        localTenantId,
        localUserId,
        normalizedEmail,
        `${input.user.firstName || ''} ${input.user.lastName || ''}`.trim() || normalizedEmail,
      );
    }

    console.log(
      `[provisioning] OK (from tenant list) — user=${localUserId} tenants=${input.tenants.length} chosen=${localTenantId}`,
    );
    return { localUserId, localTenantId };
  } catch (error) {
    console.error('[provisioning] Failed to ensure local records from tenant list:', error);
    return null;
  }
}
