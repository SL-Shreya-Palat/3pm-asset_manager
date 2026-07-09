'use client';

import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  isSparsePermissions,
  isWildcardPermissions,
  SparsePermissionIndex,
} from '@/lib/rbac';
import type { SparsePermissions } from '@/lib/rbac';

interface RoleAccess {
  /** True while auth is still hydrating — UI should show a loading state. */
  loading: boolean;
  /** True for admin/owner (wildcard permissions). */
  hasFullAccess: boolean;
  /** True for driver role (mobile-only, no portal access). */
  isMobileOnly: boolean;
  /** Check if the user can view a specific module. */
  canAccessModule: (moduleKey: string) => boolean;
  /** Check if the user can view a specific submodule. */
  canAccessSubModule: (moduleKey: string, subModuleKey: string) => boolean;
  /** The underlying permission index for granular checks. */
  permissionIndex: SparsePermissionIndex;
}

export function useRoleAccess(): RoleAccess {
  const { user } = useAuth();

  return useMemo(() => {
    const tenant = user?.tenant;

    // Not loaded yet — deny everything and signal loading.
    // Consumers (sidebar, PortalGuard) should render a skeleton.
    if (!tenant) {
      return {
        loading: true,
        hasFullAccess: false,
        isMobileOnly: false,
        canAccessModule: () => false,
        canAccessSubModule: () => false,
        permissionIndex: new SparsePermissionIndex(),
      };
    }

    // Check role flags and tenant ownership for admin/owner detection.
    const isOwnerByTenant = !!(user?.id && tenant.ownerId && user.id === tenant.ownerId);
    const isOwnerOrAdmin =
      tenant.isAdmin === true ||
      isOwnerByTenant;

    const permissions = tenant.permissions;

    // Build the permission index
    const index = new SparsePermissionIndex();

    // Admin/Owner — full access (via wildcard or role flags)
    if (
      isOwnerOrAdmin ||
      (isSparsePermissions(permissions) && isWildcardPermissions(permissions as SparsePermissions))
    ) {
      index.build({ v: 2, forms: ['*'], m: ['*'], sm: [] });
      return {
        loading: false,
        hasFullAccess: true,
        isMobileOnly: false,
        canAccessModule: () => true,
        canAccessSubModule: () => true,
        permissionIndex: index,
      };
    }

    // Sparse v2 permissions
    if (isSparsePermissions(permissions)) {
      index.build(permissions as SparsePermissions);
      const isMobileOnly = tenant.mobileOnly === true;

      return {
        loading: false,
        hasFullAccess: false,
        isMobileOnly,
        canAccessModule: (moduleKey: string) => index.hasModuleView(moduleKey),
        canAccessSubModule: (moduleKey: string, subModuleKey: string) =>
          index.hasSubModuleView(moduleKey, subModuleKey),
        permissionIndex: index,
      };
    }

    // Fallback — no recognized permissions structure, grant no access
    return {
      loading: false,
      hasFullAccess: false,
      isMobileOnly: false,
      canAccessModule: () => false,
      canAccessSubModule: () => false,
      permissionIndex: index,
    };
  }, [user]);
}
