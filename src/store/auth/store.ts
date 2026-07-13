/**
 * Zustand auth store — holds session user, tenant context, and permissions.
 *
 * Hydrated once on app mount via `/api/auth/me`. Components read individual
 * slices selectively to avoid unnecessary re-renders (§8 coding standards).
 */
'use client';

import { create } from 'zustand';
import axios from 'axios';
import type { UserProfile } from '@/types/auth';
import { showErrorToast } from '@/lib/toastUtils';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  role: string;
  isActive: boolean;
}

interface AuthState {
  /** The authenticated user profile, null when logged out / loading. */
  user: UserProfile | null;
  /** Available tenants for the current user. */
  tenants: Tenant[];
  /** Active tenant id (from the session). */
  activeTenantId: string | null;
  /** True during initial session check. */
  loading: boolean;
  /** True after the first check completes. */
  initialized: boolean;
  /** Last error message from auth operations. */
  error: string | null;
  /** True while a tenant switch is in flight — drives the switcher's loading UI. */
  switchingTenant: boolean;
  /** The tenant being switched to, while switchingTenant is true. */
  targetTenant: Tenant | null;

  /** Fetch the current session from /api/auth/me. */
  checkAuth: () => Promise<void>;
  /** Fetch the user's tenant list from /api/tenant/list. */
  fetchTenants: () => Promise<void>;
  /** Switch to a different tenant (calls /api/tenant/switch). */
  switchTenant: (tenantId: string) => Promise<void>;
  /** Clear local state (called after logout). */
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tenants: [],
  activeTenantId: null,
  loading: true,
  initialized: false,
  error: null,
  switchingTenant: false,
  targetTenant: null,

  checkAuth: async () => {
    try {
      set({ loading: true, error: null });
      const res = await axios.get('/api/auth/me', { withCredentials: true });
      const user: UserProfile = res.data.data.user;
      set({
        user,
        activeTenantId: user.tenant?.id ?? null,
        loading: false,
        initialized: true,
      });
    } catch {
      set({ user: null, activeTenantId: null, loading: false, initialized: true });
    }
  },

  fetchTenants: async () => {
    try {
      const res = await axios.get('/api/tenant/list', { withCredentials: true });
      const data = res.data.data;
      set({
        tenants: data?.tenants ?? [],
        activeTenantId: data?.activeTenantId ?? get().activeTenantId,
      });
    } catch {
      set({ tenants: [] });
    }
  },

  switchTenant: async (tenantId: string) => {
    const { switchingTenant, activeTenantId, tenants } = get();
    // Guard against double-clicks and no-op switches to the already-active tenant.
    if (switchingTenant || tenantId === activeTenantId) return;

    const targetTenant = tenants.find((t) => t.id === tenantId) ?? null;
    set({ error: null, switchingTenant: true, targetTenant });

    try {
      await axios.post(
        '/api/tenant/switch',
        { tenantId },
        { withCredentials: true },
      );
      // Reload to pick up new tenant context everywhere (RBAC, cached data, etc).
      // switchingTenant stays true so the switcher keeps its loading state until unload.
      window.location.reload();
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.error
          ? err.response.data.error
          : 'Tenant switch failed';
      showErrorToast(`${message}. Please try again.`);
      set({ error: message, switchingTenant: false, targetTenant: null });
    }
  },

  clearSession: () => {
    set({
      user: null,
      tenants: [],
      activeTenantId: null,
      loading: false,
      initialized: true,
      error: null,
      switchingTenant: false,
      targetTenant: null,
    });
  },
}));
