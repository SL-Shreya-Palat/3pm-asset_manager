'use client';

import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { ModuleKey } from '@/lib/rbac';

interface RoleAccess {
  /** True for admin/owner (scope: 'all'). */
  hasFullAccess: boolean;
  /** True for driver role (mobile-only, no portal access). */
  isMobileOnly: boolean;
  /** Check if the user can view a specific module. */
  canAccessModule: (moduleKey: ModuleKey) => boolean;
}

interface PermissionsAll {
  scope: 'all';
}

interface PermissionsModules {
  scope: 'modules';
  modules: Partial<Record<ModuleKey, Partial<Record<string, boolean>>>>;
  mobileOnly: boolean;
}

type Permissions = PermissionsAll | PermissionsModules;

function isPermissionsObject(value: unknown): value is Permissions {
  return (
    typeof value === 'object' &&
    value !== null &&
    'scope' in value &&
    ((value as Permissions).scope === 'all' || (value as Permissions).scope === 'modules')
  );
}

export function useRoleAccess(): RoleAccess {
  const { user } = useAuth();

  return useMemo(() => {
    const tenant = user?.tenant;

    // Not loaded yet — grant full access to avoid hiding the UI during loading
    if (!tenant) {
      return {
        hasFullAccess: true,
        isMobileOnly: false,
        canAccessModule: () => true,
      };
    }

    // Check role flags, name, and tenant ownership for admin/owner detection.
    // The Owner role may be provisioned with permissions: [] (not { scope: 'all' }),
    // or the tenantMember may have no roleId at all. We also compare the user's id
    // against the tenant's ownerId as a definitive ownership check.
    const roleName = (tenant.roleName || '').toLowerCase();
    const isOwnerByTenant = !!(user?.id && tenant.ownerId && user.id === tenant.ownerId);
    const isOwnerOrAdmin =
      tenant.isAdmin === true ||
      roleName === 'owner' ||
      roleName === 'admin' ||
      isOwnerByTenant;

    const permissions = tenant.permissions;

    // Admin/Owner — full access (via permissions scope or role flags/name)
    if (isOwnerOrAdmin || (isPermissionsObject(permissions) && permissions.scope === 'all')) {
      return {
        hasFullAccess: true,
        isMobileOnly: false,
        canAccessModule: () => true,
      };
    }

    // Module-scoped permissions
    if (isPermissionsObject(permissions) && permissions.scope === 'modules') {
      const isMobileOnly = permissions.mobileOnly === true;
      const modules = permissions.modules || {};

      return {
        hasFullAccess: false,
        isMobileOnly,
        canAccessModule: (moduleKey: ModuleKey) => {
          return modules[moduleKey]?.view === true;
        },
      };
    }

    // Fallback — no recognized permissions structure, grant no access
    return {
      hasFullAccess: false,
      isMobileOnly: false,
      canAccessModule: () => false,
    };
  }, [user]);
}
