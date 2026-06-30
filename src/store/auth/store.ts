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
    try {
      set({ error: null });
      await axios.post(
        '/api/tenant/switch',
        { tenantId },
        { withCredentials: true },
      );
      // Reload to pick up new tenant context everywhere
      window.location.reload();
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.error
          ? err.response.data.error
          : 'Tenant switch failed';
      set({ error: message });
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
    });
  },
}));
