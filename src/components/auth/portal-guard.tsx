'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { getFlatNavItems } from '@/constants/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldOff } from 'lucide-react';

/**
 * Layout-level route guard for the portal.
 *
 * 1. Shows a loading skeleton while auth/permissions initialize (M2)
 * 2. Blocks mobileOnly users from the web portal (M4)
 * 3. Checks route-level permissions by matching pathname to nav config (M3)
 */
export function PortalGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { initialized } = useAuth();
  const { loading, hasFullAccess, isMobileOnly, canAccessModule, canAccessSubModule } =
    useRoleAccess();

  // 1. Loading state — show skeleton
  if (!initialized || loading) {
    return <PortalSkeleton />;
  }

  // 2. mobileOnly block (M4)
  if (isMobileOnly) {
    return <MobileOnlyMessage />;
  }

  // 3. Route-level permission check (M3)
  if (!hasFullAccess) {
    const gate = resolveRouteGate(pathname);
    if (gate) {
      const allowed = gate.requiredSubModule
        ? canAccessSubModule(gate.requiredModule, gate.requiredSubModule)
        : canAccessModule(gate.requiredModule);
      if (!allowed) {
        return <NotAuthorized />;
      }
    }
  }

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Route → permission mapping
// ---------------------------------------------------------------------------

function resolveRouteGate(
  pathname: string,
): { requiredModule: string; requiredSubModule?: string } | null {
  const flat = getFlatNavItems();

  // Sort by href length descending so deeper paths match first
  const sorted = [...flat].sort((a, b) => b.href.length - a.href.length);

  for (const item of sorted) {
    if (pathname === item.href || pathname.startsWith(item.href + '/')) {
      if (item.requiredModule) {
        return {
          requiredModule: item.requiredModule,
          requiredSubModule: item.requiredSubModule,
        };
      }
      // Matched an unguarded route (e.g. /dashboard) — allow through
      return null;
    }
  }

  // No match — unguarded route, allow through
  return null;
}

// ---------------------------------------------------------------------------
// Fallback UI components
// ---------------------------------------------------------------------------

function PortalSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

function MobileOnlyMessage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="text-center">
        <ShieldOff className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">Mobile Access Only</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account is configured for mobile app access only. Please use the
          mobile app to access your account.
        </p>
      </div>
    </div>
  );
}

function NotAuthorized() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="text-center">
        <ShieldOff className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">Access Denied</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have permission to access this page. Contact your
          administrator if you believe this is an error.
        </p>
      </div>
    </div>
  );
}
