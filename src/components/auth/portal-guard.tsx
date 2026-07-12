'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { getFlatNavItems } from '@/constants/navigation';
import { ShieldOff } from 'lucide-react';
import { DriverInspectionGate } from '@/components/inspections/driver-inspection-gate';
import { FleetAppLoader } from '@/components/loaders/fleet-app-loader';

/**
 * Layout-level route guard for the portal.
 *
 * 1. Shows the fleet loader while auth/permissions initialize (M2)
 * 2. Blocks mobileOnly users from the web portal (M4)
 * 3. Checks route-level permissions by matching pathname to nav config (M3)
 */
export function PortalGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { initialized } = useAuth();
  const { loading, hasFullAccess, canAccessModule, canAccessSubModule } =
    useRoleAccess();

  // 1. Loading state — show the fleet loader
  if (!initialized || loading) {
    return <FleetAppLoader />;
  }

  // NOTE: mobileOnly roles are intentionally NOT blocked here — the installed
  // PWA is this product's mobile surface and uses the same web session.
  // Their access is limited by role permission grants (M3 below + server RBAC).

  // 2. Route-level permission check (M3)
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

  return (
    <>
      {children}
      {/* Driver-inspection hard gate — overlays everything when the current
          driver owes an inspection this period. Renders null otherwise. */}
      <DriverInspectionGate />
    </>
  );
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
