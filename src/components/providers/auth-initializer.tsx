/**
 * Auth initializer — runs once on app mount to hydrate the Zustand auth store.
 * Must be rendered as a client component inside the root layout.
 */
'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth/store';

export function AuthInitializer({ children }: { children: React.ReactNode }) {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const initialized = useAuthStore((s) => s.initialized);

  useEffect(() => {
    if (!initialized) {
      checkAuth();
    }
  }, [checkAuth, initialized]);

  return <>{children}</>;
}
