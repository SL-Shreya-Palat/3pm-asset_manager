'use client';

import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';

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

  // Delegate to the index — handles wildcard, module, submodule, and form checks
  if (hasFullAccess || permissionIndex.hasPermission(permission)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
