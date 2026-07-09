/**
 * Client-side auth hook — thin wrapper around the Zustand auth store.
 *
 * Usage:
 * ```tsx
 * const { user, isAuthenticated, loading } = useAuth();
 * ```
 */
'use client';

import { useAuthStore } from '@/store/auth/store';

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const initialized = useAuthStore((s) => s.initialized);
  const error = useAuthStore((s) => s.error);
  const activeTenantId = useAuthStore((s) => s.activeTenantId);

  return {
    user,
    isAuthenticated: !!user,
    loading,
    initialized,
    error,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    tenantId: activeTenantId,
    tenantName: user?.tenant?.name ?? null,
  };
}