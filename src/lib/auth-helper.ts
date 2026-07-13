/**
 * Server-side auth helper — the **first call in every route handler**.
 *
 * Supports both web (3pm-auth cookies) and mobile (Bearer / X-Session-Token headers).
 * Mirrors construction-portal/lib/auth-helper.ts.
 */
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth-3pm';
import { authLog } from '@/lib/auth-logger';
import {
  getSessionsCollection,
  getUsersCollection,
  getTenantMembersCollection,
  getTenantsCollection,
  getWorkspaceMembersCollection,
  getWorkspacesCollection,
  getRolesCollection,
} from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

/** Cookie for persisting switched tenant (local _id). */
export const CURRENT_TENANT_ID_COOKIE = 'current_tenant_id';

/**
 * Filter fragment for tenant memberships that actually grant portal access.
 * Excludes archived members (archive must revoke access, matching
 * construction-portal) and members still in the invited/'pending' stage —
 * an invitation only grants access once it has been accepted (the auth
 * callback flips status to 'active' at that point).
 */
export const ACTIVE_MEMBER_FILTER = {
  isActive: true,
  portalUser: { $ne: false },
  isArchived: { $ne: true },
  status: { $ne: 'pending' },
} as const;

/**
 * Resolve current tenant for 3PM web users.
 * Cookie (current_tenant_id) takes precedence over JWT tenant.
 */
export async function resolveCurrentTenantFor3PM(
  req: NextRequest | null,
  userId: string,
  sessionTenantId: string | null | undefined,
): Promise<{ currentTenantId: string | null; authTenantId: string | null; tenantStatus: 'active' | 'deactivated' | 'none' }> {
  if (!userId || !ObjectId.isValid(userId)) {
    return { currentTenantId: null, authTenantId: null, tenantStatus: 'none' };
  }

  const tenantMembersCollection = await getTenantMembersCollection();
  const tenantsCollection = await getTenantsCollection();
  const userObjectId = ObjectId.createFromHexString(userId);

  // 1. Check cookie first (user switched tenant)
  const cookieValue = req?.cookies?.get(CURRENT_TENANT_ID_COOKIE)?.value;
  if (cookieValue && ObjectId.isValid(cookieValue)) {
    const tenantObjectId = ObjectId.createFromHexString(cookieValue);
    const member = await tenantMembersCollection.findOne({
      userId: userObjectId,
      tenantId: tenantObjectId,
      ...ACTIVE_MEMBER_FILTER,
    });
    if (member) {
      const tenant = await tenantsCollection.findOne({ _id: tenantObjectId, isActive: { $ne: false } });
      if (tenant) {
        const authTenantId = (tenant as { authTenantId?: ObjectId }).authTenantId;
        return {
          currentTenantId: tenantObjectId.toString(),
          authTenantId: authTenantId?.toString() ?? null,
          tenantStatus: 'active',
        };
      }
    }
  }

  // 2. Fallback: resolve 3PM tenant id (from JWT) to local tenant
  if (sessionTenantId && typeof sessionTenantId === 'string') {
    const tenant = ObjectId.isValid(sessionTenantId)
      ? await tenantsCollection.findOne({
          $or: [
            { authTenantId: ObjectId.createFromHexString(sessionTenantId) },
            { _id: ObjectId.createFromHexString(sessionTenantId) },
          ],
          isActive: { $ne: false },
        })
      : await tenantsCollection.findOne({ authTenantId: sessionTenantId, isActive: { $ne: false } });

    if (tenant) {
      const member = await tenantMembersCollection.findOne({
        userId: userObjectId,
        tenantId: tenant._id,
        ...ACTIVE_MEMBER_FILTER,
      });
      if (member) {
        const authTenantId = (tenant as { authTenantId?: ObjectId | string }).authTenantId;
        const authTenantIdStr = authTenantId != null
          ? typeof authTenantId === 'string' ? authTenantId : authTenantId.toString()
          : tenant._id.toString();
        authLog.authHelper.resolveTenant('jwt', tenant._id.toString(), authTenantIdStr);
        return { currentTenantId: tenant._id.toString(), authTenantId: authTenantIdStr, tenantStatus: 'active' };
      }
    }
  }

  // 3. Fallback: first active tenant membership
  const activeMemberships = await tenantMembersCollection
    .find({ userId: userObjectId, ...ACTIVE_MEMBER_FILTER }, { sort: { createdAt: 1 } })
    .toArray();

  if (activeMemberships.length > 0) {
    const memberTenantIds = activeMemberships.map((m) => m.tenantId);
    const activeTenants = await tenantsCollection
      .find({ _id: { $in: memberTenantIds }, isActive: { $ne: false } })
      .toArray();

    if (activeTenants.length > 0) {
      const activeTenantById = new Map(activeTenants.map((t) => [t._id.toString(), t]));
      const firstActiveMember = activeMemberships.find((m) => activeTenantById.has(m.tenantId.toString()));
      const tenant = (firstActiveMember && activeTenantById.get(firstActiveMember.tenantId.toString())) || activeTenants[0];

      const authTenantId = (tenant as { authTenantId?: ObjectId | string }).authTenantId;
      const authTenantIdStr = authTenantId != null
        ? typeof authTenantId === 'string' ? authTenantId : authTenantId.toString()
        : tenant._id.toString();
      authLog.authHelper.resolveTenant('membership', tenant._id.toString(), authTenantIdStr);
      return { currentTenantId: tenant._id.toString(), authTenantId: authTenantIdStr, tenantStatus: 'active' };
    }

    return { currentTenantId: null, authTenantId: null, tenantStatus: 'deactivated' };
  }

  return { currentTenantId: null, authTenantId: null, tenantStatus: 'none' };
}

/**
 * Unified authentication helper — supports web (3pm-auth cookies) and mobile (headers).
 */
export async function getAuthenticatedUser(req?: NextRequest) {
  try {
    // ── Widget Builder proxy auth (X-App-Secret) ─────────────────────
    // Widget data requests are proxied by Widget Builder server-to-server
    // (no user cookie). Tenant is resolved from X-Tenant-Id or from the
    // X-WB-Organization-Id → embedTokens mapping; no fallback — an
    // unresolvable tenant is rejected rather than leaking another tenant.
    if (req) {
      const appSecret = req.headers.get('x-app-secret');
      const widgetBuilderAppSecret = process.env.WIDGET_BUILDER_APP_SECRET;

      if (appSecret && widgetBuilderAppSecret && appSecret === widgetBuilderAppSecret) {
        const tenantsCollection = await getTenantsCollection();
        const usersCollection = await getUsersCollection();

        const requestedTenantId = req.headers.get('x-tenant-id');
        const wbOrganizationId = req.headers.get('x-wb-organization-id');

        let tenant = null;

        // 1. Direct tenant ID
        if (requestedTenantId && ObjectId.isValid(requestedTenantId)) {
          tenant = await tenantsCollection.findOne({
            _id: ObjectId.createFromHexString(requestedTenantId),
            isActive: { $ne: false },
          });
        }

        // 2. Look up tenant from WB organizationId via embedTokens mapping
        if (!tenant && wbOrganizationId) {
          const { getTenantIdFromOrganizationId } = await import('@/lib/embed-token-storage');
          const mappedTenantId = await getTenantIdFromOrganizationId(wbOrganizationId);
          if (mappedTenantId) {
            tenant = await tenantsCollection.findOne({
              _id: mappedTenantId,
              isActive: { $ne: false },
            });
          }
        }

        if (!tenant) {
          console.error(
            '[auth-helper] Widget Builder auth failed: could not resolve tenant',
            { requestedTenantId, wbOrganizationId },
          );
          return null;
        }

        const owner = tenant.ownerId
          ? await usersCollection.findOne({ _id: tenant.ownerId })
          : null;

        return {
          id: owner?._id?.toString() || 'widget-builder-system',
          email: owner?.email || 'system@widget-builder',
          name: owner?.name || 'Widget Builder',
          image: null,
          sessionToken: null,
          currentTenantId: tenant._id.toString(),
          authTenantId: null,
        };
      }
    }

    // ── Command service auth (X-Client-Id/X-Client-Secret) ───────────
    // Construction-portal (Command) reads Asset Manager maintenance data
    // server-to-server for a tenant it manages. It presents the SAME shared
    // service credential the two apps already use (Command's
    // ASSET_MANAGER_CLIENT_ID/SECRET == AM's COMMAND_SERVICE_CLIENT_ID/SECRET),
    // and the shared 3PM tenant id in X-Tenant-Id. We map it to the local tenant
    // and act as its owner. Read-only endpoints only (see app/api/command-read/*).
    if (req) {
      const clientId = req.headers.get('x-client-id');
      const clientSecret = req.headers.get('x-client-secret');
      const expectedId = process.env.COMMAND_SERVICE_CLIENT_ID;
      const expectedSecret = process.env.COMMAND_SERVICE_CLIENT_SECRET;

      // Fail CLOSED: both the id AND the secret must be configured and match.
      // A client-id is an identifier, not a credential — never authenticate on it
      // alone (this branch grants tenant-owner access to every route).
      if (
        clientId &&
        clientSecret &&
        expectedId &&
        expectedSecret &&
        clientId === expectedId &&
        clientSecret === expectedSecret
      ) {
        const authTenantId = req.headers.get('x-tenant-id');
        if (!authTenantId) {
          console.error('[auth-helper] Command service call missing X-Tenant-Id');
          return null;
        }

        const tenantsCollection = await getTenantsCollection();
        const usersCollection = await getUsersCollection();

        const or: Record<string, unknown>[] = [{ authTenantId }];
        if (ObjectId.isValid(authTenantId)) {
          or.push({ authTenantId: ObjectId.createFromHexString(authTenantId) });
        }
        const tenant = await tenantsCollection.findOne({ $or: or, isActive: { $ne: false } });
        if (!tenant) {
          console.error('[auth-helper] Command service call: no tenant for authTenantId', authTenantId);
          return null;
        }

        const owner = tenant.ownerId ? await usersCollection.findOne({ _id: tenant.ownerId }) : null;
        const tAuth = (tenant as { authTenantId?: ObjectId | string }).authTenantId;
        return {
          id: owner?._id?.toString() || 'command-service-system',
          email: owner?.email || 'system@command',
          name: owner?.name || 'Command',
          image: null,
          sessionToken: null,
          currentTenantId: tenant._id.toString(),
          authTenantId: tAuth != null ? (typeof tAuth === 'string' ? tAuth : tAuth.toString()) : authTenantId,
        };
      }
    }

    // ── Session token auth (mobile app) ──────────────────────────────
    if (req) {
      const authHeader = req.headers.get('authorization');
      const sessionTokenHeader = req.headers.get('x-session-token');
      const sessionToken = authHeader?.replace('Bearer ', '') || sessionTokenHeader;

      if (sessionToken) {
        const sessionsCollection = await getSessionsCollection();
        const usersCollection = await getUsersCollection();
        const tenantMembersCollection = await getTenantMembersCollection();

        const session = await sessionsCollection.findOne({ token: sessionToken, isActive: true });
        if (!session) return null;

        if (new Date() > new Date(session.expiresAt)) {
          await sessionsCollection.updateOne({ token: sessionToken }, { $set: { isActive: false } });
          return null;
        }

        // Update last activity (fire-and-forget)
        sessionsCollection
          .updateOne({ token: sessionToken }, { $set: { lastActivityAt: new Date() } })
          .catch((err: unknown) => console.error('Error updating session activity:', err));

        const user = await usersCollection.findOne({ _id: session.userId });
        if (!user) return null;

        // Check for active tenant membership
        const activeTenantMember = await tenantMembersCollection.findOne({
          userId: session.userId,
          portalUser: true,
          isActive: true,
          isArchived: { $ne: true },
          status: { $ne: 'pending' },
        });

        if (!activeTenantMember) {
          const anyTenantMember = await tenantMembersCollection.findOne({
            userId: session.userId,
            portalUser: true,
          });
          if (anyTenantMember) {
            await sessionsCollection.updateOne({ token: sessionToken }, { $set: { isActive: false } });
            return null;
          }
        }

        const userIdStr = user._id.toString();
        let currentTenantId: string | null = session.currentTenantId ? session.currentTenantId.toString() : null;
        let authTenantIdOut: string | null = null;

        if (!currentTenantId) {
          const resolved = await resolveCurrentTenantFor3PM(req ?? null, userIdStr, null);
          currentTenantId = resolved.currentTenantId;
          authTenantIdOut = resolved.authTenantId;
        }

        return {
          id: userIdStr,
          email: user.email,
          name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          image: user.profileImageUrl || user.image || null,
          sessionToken,
          currentTenantId,
          authTenantId: authTenantIdOut,
        };
      }
    }

    // ── 3PM Auth session (web) ───────────────────────────────────────
    const session = await getSession();
    if (!session?.id) return null;

    // Resolve to local user id
    const usersCollection = await getUsersCollection();
    const isValidObjectId = /^[a-f\d]{24}$/i.test(session.id);
    let localUser = null;
    if (isValidObjectId) {
      localUser = await usersCollection.findOne({ authUserId: ObjectId.createFromHexString(session.id) });
    }
    if (!localUser && session.email) {
      localUser = await usersCollection.findOne({ email: session.email.toLowerCase().trim() });
    }
    const userId = localUser?._id?.toString() ?? session.id;

    const { currentTenantId, authTenantId, tenantStatus } = await resolveCurrentTenantFor3PM(
      req ?? null,
      userId,
      session.tenantId,
    );

    authLog.authHelper.getAuthUser(userId, 'web');
    return {
      id: userId,
      email: session.email,
      name: `${session.firstName || ''} ${session.lastName || ''}`.trim() || session.email,
      image: session.profilePicUrl || null,
      sessionToken: null,
      currentTenantId: currentTenantId ?? null,
      authTenantId: authTenantId ?? null,
      // Distinguishes "no membership anywhere" (none) from "member of only
      // deactivated tenants" (deactivated) so the client can show the right
      // recovery message instead of an infinite spinner.
      tenantStatus,
    };
  } catch (error) {
    console.error('Error in getAuthenticatedUser:', error);
    return null;
  }
}

/**
 * Get user's workspaces with role information.
 */
export async function getUserWorkspaces(userId: string) {
  try {
    const workspaceMembersCollection = await getWorkspaceMembersCollection();
    const workspacesCollection = await getWorkspacesCollection();
    const rolesCollection = await getRolesCollection();
    const userObjectId = ObjectId.createFromHexString(userId);

    const workspaceMembers = await workspaceMembersCollection
      .find({ userId: userObjectId, status: 'ACTIVE' })
      .toArray();

    if (workspaceMembers.length === 0) return [];

    const workspaceIds = workspaceMembers.map((wm) => wm.workspaceId);
    const workspaces = await workspacesCollection
      .find({ _id: { $in: workspaceIds }, isActive: true })
      .toArray();

    const roleIds = workspaceMembers.map((wm) => wm.roleId).filter((id) => id);
    const roles = roleIds.length > 0
      ? await rolesCollection.find({ _id: { $in: roleIds } }).toArray()
      : [];

    const rolesMap = new Map(roles.map((role) => [role._id.toString(), role]));
    const workspaceMap = new Map(workspaces.map((ws) => [ws._id.toString(), ws]));

    return workspaceMembers
      .map((member) => {
        const workspace = workspaceMap.get(member.workspaceId.toString());
        const role = member.roleId ? rolesMap.get(member.roleId.toString()) : null;
        if (!workspace) return null;
        return {
          id: workspace._id.toString(),
          name: workspace.name,
          type: workspace.type,
          description: workspace.description,
          settings: workspace.settings,
          tenantId: workspace.tenantId ? workspace.tenantId.toString() : null,
          role: role ? { id: role._id.toString(), name: role.name, permissions: role.permissions || [] } : null,
          status: member.status,
          joinedAt: member.joinedAt,
          lastAccessedAt: member.lastAccessedAt,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error('Error getting user workspaces:', error);
    return [];
  }
}

/** Get user's tenant information (including role name from roles collection). */
export async function getUserTenant(userId: string) {
  try {
    const tenantMembersCollection = await getTenantMembersCollection();
    const tenantsCollection = await getTenantsCollection();
    const rolesCollection = await getRolesCollection();
    const userObjectId = ObjectId.createFromHexString(userId);

    const tenantMember = await tenantMembersCollection.findOne({
      userId: userObjectId,
      isActive: true,
      isArchived: { $ne: true },
      status: { $ne: 'pending' },
    });
    if (!tenantMember) return null;

    const tenant = await tenantsCollection.findOne({ _id: tenantMember.tenantId });
    if (!tenant) return null;

    // Look up role from roles collection via tenantMember.roleId
    let roleName: string | null = null;
    let permissions: unknown = null;
    let isAdmin: boolean | null = null;
    let isManager: boolean | null = null;
    let isTeamManager: boolean | null = null;
    let isMechanic: boolean | null = null;
    let isDriver: boolean | null = null;

    if (tenantMember.roleId) {
      const role = await rolesCollection.findOne({ _id: tenantMember.roleId });
      roleName = role?.name ?? null;
      permissions = role?.permissions ?? null;
      isAdmin = role?.isAdmin ?? null;
      isManager = role?.isManager ?? null;
      isTeamManager = role?.isTeamManager ?? null;
      isMechanic = role?.isMechanic ?? null;
      isDriver = role?.isDriver ?? null;
    }

    // If the user is the tenant owner, always grant owner-level access regardless
    // of whatever role document the tenantMember happens to point to. This handles:
    // - tenantMember with no roleId (created before role was upserted)
    // - tenantMember linked to a wrong role (e.g. "Member" instead of "Owner")
    // - Owner role with stale/empty permissions
    const ownerIdStr = tenant.ownerId ? tenant.ownerId.toString() : null;
    const isOwnerByTenant = ownerIdStr === userId;

    if (isOwnerByTenant) {
      roleName = 'Owner';
      isAdmin = true;
      permissions = { v: 2, forms: ['*'], m: ['*'], sm: [] };
    }

    return {
      id: tenant._id.toString(),
      name: tenant.name,
      ownerId: ownerIdStr || '',
      logoUrl: tenant.logoUrl || null,
      isActive: tenant.isActive,
      roleName,
      permissions,
      isAdmin,
      isManager,
      isTeamManager,
      isMechanic,
      isDriver,
    };
  } catch (error) {
    console.error('Error getting user tenant:', error);
    return null;
  }
}

/**
 * Resolve the current user's role flags for a tenant — used for visibility
 * scoping (e.g. full-access roles see all work orders; others see only theirs).
 * Returns null when no active role can be resolved.
 */
export async function getUserRoleForTenant(
  userId: string,
  tenantId: string,
): Promise<{ memberId: string; nameLower: string; isAdmin: boolean; isManager: boolean; isMechanic: boolean; isDriver: boolean; fullAccess: boolean } | null> {
  try {
    if (!ObjectId.isValid(userId) || !ObjectId.isValid(tenantId)) return null;
    const tenantMembersCollection = await getTenantMembersCollection();
    const rolesCollection = await getRolesCollection();

    const member = await tenantMembersCollection.findOne({
      userId: ObjectId.createFromHexString(userId),
      tenantId: ObjectId.createFromHexString(tenantId),
      isActive: true,
      isArchived: { $ne: true },
      status: { $ne: 'pending' },
    });
    if (!member?.roleId) return null;

    const role = await rolesCollection.findOne({ _id: member.roleId as ObjectId });
    if (!role) return null;

    const nameLower = (role.nameLower as string) || '';
    const isAdmin = role.isAdmin === true;
    const isManager = role.isManager === true;
    const isMechanic = role.isMechanic === true;
    const isDriver = role.isDriver === true || nameLower === 'driver';
    const scopeAll =
      typeof role.permissions === 'object' &&
      role.permissions !== null &&
      Array.isArray((role.permissions as { forms?: unknown }).forms) &&
      (role.permissions as { forms?: unknown[] }).forms?.[0] === '*';

    return { memberId: member._id.toString(), nameLower, isAdmin, isManager, isMechanic, isDriver, fullAccess: isAdmin || isManager || scopeAll };
  } catch (error) {
    console.error('Error resolving user role for tenant:', error);
    return null;
  }
}

/** Get complete user profile with workspaces and tenant information. */
export async function getUserProfile(userId: string) {
  try {
    const usersCollection = await getUsersCollection();
    const user = await usersCollection.findOne({ _id: ObjectId.createFromHexString(userId) });
    if (!user) return null;

    const [workspaces, tenant] = await Promise.all([getUserWorkspaces(userId), getUserTenant(userId)]);

    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      phoneNumber: user.phoneNumber || null,
      profileImageUrl: user.profileImageUrl || user.image || null,
      address: user.address || null,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt,
      tenant,
      workspaces,
    };
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}
