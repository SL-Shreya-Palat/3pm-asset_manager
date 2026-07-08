'use client';

import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { PermissionChecker } from '@/lib/rbac';
import type { SparsePermissions } from '@/lib/rbac';
import { isSparsePermissions } from '@/lib/rbac';

interface PermissionGuardProps {
  /** Permission string to check, e.g. "inspections:inspectionHistory:view" */
  permission: string;
  /** Fallback UI when permission is denied. Defaults to null. */
  fallback?: React.ReactNode;
  /** If true, renders children while auth is still loading. */
  shouldRenderWhileLoading?: boolean;
  children: React.ReactNode;
}

export function PermissionGuard({
  permission,
  fallback = null,
  shouldRenderWhileLoading = false,
  children,
}: PermissionGuardProps) {
  const { loading, initialized } = useAuth();
  const { hasFullAccess, permissionIndex } = useRoleAccess();

  // Early return for loading state
  if (!initialized && loading && !shouldRenderWhileLoading) {
    return null;
  }

  // Wildcard (admin/owner) — always allowed
  if (hasFullAccess) {
    return <>{children}</>;
  }

  // Parse permission string and check against the index
  const parts = permission.split(':');

  let hasPermission = false;

  // "module:view"
  if (parts.length === 2 && parts[1] === 'view') {
    hasPermission = permissionIndex.hasModuleView(parts[0]);
  }
  // "module:submodule:view"
  else if (parts.length === 3 && parts[2] === 'view') {
    hasPermission = permissionIndex.hasSubModuleView(parts[0], parts[1]);
  }
  // "module:submodule:form:action"
  else if (parts.length === 4) {
    const [mod, sub, form, action] = parts;
    const formId = `${mod}.${sub}.${form}`;
    if (['view', 'create', 'inspect', 'edit', 'archive', 'delete'].includes(action)) {
      const result = permissionIndex.hasFormPermission(
        formId,
        action as 'view' | 'create' | 'inspect' | 'edit' | 'archive' | 'delete',
      );
      hasPermission = action === 'view' ? result !== 'NONE' : Boolean(result);
    }
  }

  if (hasPermission) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
