'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Building2, LogOut, RefreshCw } from 'lucide-react';

/**
 * Recovery screen for the "signed in, but no tenant resolves" dead-end.
 *
 * Previously this state pinned the portal on an infinite "Loading your fleet…"
 * spinner (useRoleAccess reported `loading` forever when `user.tenant` was
 * null), with no error and no way out. That happens when the 3pm-auth session
 * is valid but the JWT carries no tenant (e.g. the org's app subscription
 * became active only after the token was minted) — see the callback's
 * tenant-list provisioning, which now covers most of these at login time.
 *
 * This mirrors construction-portal's /organization-setup: do ONE silent
 * re-auth (a fresh /authorize round-trip re-derives + self-heals the tenant),
 * and if it STILL can't resolve, show an actionable screen (with the right
 * message for deactivated vs no-access) plus Sign out — never an endless spin.
 */

const RETRY_KEY = 'am_tenant_reauth_attempted';

const subscribeRetryFlag = (callback: () => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
};
const getRetryFlag = () =>
  typeof window !== 'undefined' &&
  window.sessionStorage.getItem(RETRY_KEY) === '1';
const getRetryFlagServer = () => false;

export function NoOrganizationAccess({
  tenantStatus,
}: {
  tenantStatus?: 'active' | 'deactivated' | 'none';
}) {
  // Read the ?reauth marker once (SSR-safe; it only changes via a full
  // navigation, which remounts this component). Avoids useSearchParams so no
  // Suspense boundary is required around PortalGuard.
  const [reauth] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('reauth'),
  );

  // Read the flag via useSyncExternalStore so it's available during render
  // (SSR-safe, no setState-in-effect).
  const alreadyAttempted = useSyncExternalStore(
    subscribeRetryFlag,
    getRetryFlag,
    getRetryFlagServer,
  );

  // Landed back from the re-auth round-trip (?reauth=1) still tenantless —
  // clear the flag so a LATER loss of access in this browser session re-arms
  // the one-shot retry instead of dead-ending immediately.
  useEffect(() => {
    if (reauth === '1' && typeof window !== 'undefined') {
      window.sessionStorage.removeItem(RETRY_KEY);
    }
  }, [reauth]);

  const shouldAutoRetry = reauth !== '1' && !alreadyAttempted;

  useEffect(() => {
    if (!shouldAutoRetry || typeof window === 'undefined') return;
    window.sessionStorage.setItem(RETRY_KEY, '1');
    // Fresh /authorize → self-heals subscription/tenant → new JWT with tenant
    // → callback re-provisions → back here (now with a tenant, so this screen
    // won't render), or ?reauth=1 if still unresolved.
    window.location.replace(
      '/api/auth/login?returnUrl=' + encodeURIComponent('/dashboard?reauth=1'),
    );
  }, [shouldAutoRetry]);

  const isDeactivated = tenantStatus === 'deactivated';

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen flex-col items-center justify-center bg-white p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="inline-flex items-center justify-center rounded-full bg-primary-100 p-4">
          <Building2 className="h-9 w-9 text-primary" aria-hidden />
        </div>

        {shouldAutoRetry ? (
          <>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                Finishing sign-in
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Checking your organization access…
              </p>
            </div>
            <RefreshCw
              className="h-6 w-6 animate-spin text-primary"
              aria-hidden
            />
          </>
        ) : (
          <>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                {isDeactivated
                  ? 'Organization deactivated'
                  : 'No organization access'}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {isDeactivated
                  ? 'Your organization has been deactivated by your administrator. Please contact them to reactivate it and restore your access.'
                  : "You're signed in, but your account isn't a member of any active organization here. Ask your administrator to add you, or try signing in again."}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.sessionStorage.removeItem(RETRY_KEY);
                    window.location.href = '/dashboard';
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Try again
              </button>
              <a
                href="/api/auth/logout"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-6 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
