/**
 * Server-side authorization helpers.
 *
 * `requireAdmin` — Phase 0: gates crown-jewel endpoints (roles, users,
 * settings) behind an admin/owner check.
 *
 * `authorize` — Phase 1: authenticates, resolves form-level permissions,
 * denies if the requested action is not allowed, and returns the effective
 * scope (ALL | OWN) so the route can filter/verify ownership.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserRoleForTenant } from '@/lib/auth-helper';
import { getFormPermissionLevels } from '@/lib/server-permissions';
import type { FormPermissionLevels } from '@/lib/server-permissions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthzAction = 'view' | 'create' | 'edit' | 'delete' | 'archive' | 'inspect';
export type AuthzScope = 'ALL' | 'OWN';

export interface AuthzContext {
  user: { id: string; currentTenantId: string; [key: string]: unknown };
  scope: AuthzScope;
  perms: FormPermissionLevels;
  /**
   * Team restriction for team-scoped roles: `null` = unrestricted,
   * an array = the caller may only touch records in these teams.
   * Routes/controllers must apply this on top of `scope`.
   */
  teamIds: string[] | null;
}

/**
 * Check a single record against the caller's team restriction.
 * `recordTeamIds` accepts the document's team linkage in any stored shape
 * (ObjectId[] `teamIds`, single ObjectId `teamId`, or strings).
 * Unrestricted callers (teamIds === null) always pass.
 */
export function inTeamScope(
  teamIds: string[] | null,
  recordTeamIds: unknown,
): boolean {
  if (teamIds === null) return true;
  const record = (Array.isArray(recordTeamIds) ? recordTeamIds : [recordTeamIds])
    .filter(Boolean)
    .map((id) => String(id));
  return record.some((id) => teamIds.includes(id));
}

type AuthzOk = { ok: true; ctx: AuthzContext };
type AuthzFail = { ok: false; res: NextResponse };

// ---------------------------------------------------------------------------
// requireAdmin — Phase 0
// ---------------------------------------------------------------------------

/** 401 if unauthenticated; 403 if not an admin/owner of the current tenant. */
export async function requireAdmin(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user?.id || !user.currentTenantId) {
    return { ok: false as const, res: NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 }) };
  }
  const role = await getUserRoleForTenant(user.id, user.currentTenantId);
  if (!role?.isAdmin) {
    return { ok: false as const, res: NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const, user };
}

// ---------------------------------------------------------------------------
// authorize — Phase 1
// ---------------------------------------------------------------------------

/**
 * Authenticate the request, resolve the user's permission levels for `formId`,
 * and deny if the requested `action` is not allowed.
 *
 * Returns `{ ok: true, ctx }` on success where `ctx.scope` is `'ALL'` or
 * `'OWN'`.  The route should use `scope` to filter list results (pass
 * `createdBy` to the controller) or verify single-record ownership.
 *
 * Returns `{ ok: false, res }` with a 401 or 403 NextResponse on failure.
 */
export async function authorize(
  req: NextRequest,
  formId: string,
  action: AuthzAction,
): Promise<AuthzOk | AuthzFail> {
  const user = await getAuthenticatedUser(req);
  if (!user?.id || !user.currentTenantId) {
    return { ok: false, res: NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 }) };
  }

  // At this point user.id and user.currentTenantId are guaranteed non-null,
  // but TS can't narrow the union from getAuthenticatedUser. Cast once here.
  const authedUser = user as AuthzContext['user'];

  const perms = await getFormPermissionLevels(authedUser.id, authedUser.currentTenantId, formId);

  // M4: Block mobileOnly roles on web (cookie) sessions.
  // Bearer / X-Session-Token requests (mobile app) are allowed through.
  if (perms.mobileOnly) {
    const hasBearerAuth = !!req.headers.get('authorization') || !!req.headers.get('x-session-token');
    if (!hasBearerAuth) {
      return { ok: false, res: NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 }) };
    }
  }

  const teamIds = perms.teamIds;

  switch (action) {
    case 'view':
      if (perms.view === 'NONE')
        return { ok: false, res: NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 }) };
      return { ok: true, ctx: { user: authedUser, scope: perms.view, perms, teamIds } };

    case 'create':
      if (!perms.create)
        return { ok: false, res: NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 }) };
      return { ok: true, ctx: { user: authedUser, scope: 'ALL', perms, teamIds } };

    case 'edit':
      if (perms.edit === false)
        return { ok: false, res: NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 }) };
      return { ok: true, ctx: { user: authedUser, scope: perms.edit, perms, teamIds } };

    case 'delete':
      if (perms.delete === false)
        return { ok: false, res: NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 }) };
      return { ok: true, ctx: { user: authedUser, scope: perms.delete, perms, teamIds } };

    case 'archive':
      if (perms.archive === false)
        return { ok: false, res: NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 }) };
      return { ok: true, ctx: { user: authedUser, scope: perms.archive, perms, teamIds } };

    case 'inspect':
      if (perms.inspect === false)
        return { ok: false, res: NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 }) };
      return { ok: true, ctx: { user: authedUser, scope: perms.inspect, perms, teamIds } };
  }
}
