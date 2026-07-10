'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { navItems } from '@/constants/navigation';
import type { NavItem, NavChild } from '@/constants/navigation';
import { useRoleAccess } from '@/hooks/use-role-access';
import { useConnection } from '@/hooks/use-connection';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/auth/store';

function useFilteredNavItems() {
  const { loading, isMobileOnly, canAccessModule, canAccessSubModule } = useRoleAccess();
  // When connected to Command, hide features owned by Command (e.g. Purchase
  // Orders — procurement is managed in Command only).
  const { connected } = useConnection();

  const items = useMemo(() => {
    if (loading) return [];

    const canSeeItem = (item: NavChild | NavItem) => {
      if (connected && item.hiddenWhenCommandConnected) return false;
      if (item.requiredSubModule && item.requiredModule) {
        return canAccessSubModule(item.requiredModule, item.requiredSubModule);
      }
      if (item.requiredModule) return canAccessModule(item.requiredModule);
      // Items with no gate (e.g. Dashboard) are visible to all portal users
      return !isMobileOnly;
    };

    const filtered: NavItem[] = [];
    for (const item of navItems) {
      if (item.children) {
        // Filter children, show parent only if any child is visible
        const visibleChildren = item.children.filter(canSeeItem);
        if (visibleChildren.length > 0) {
          filtered.push({ ...item, children: visibleChildren });
        }
      } else {
        if (canSeeItem(item)) {
          filtered.push(item);
        }
      }
    }
    return filtered;
  }, [loading, isMobileOnly, canAccessModule, canAccessSubModule, connected]);

  return { loading, items };
}

function NavSkeleton({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex flex-col gap-1 px-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex items-center gap-3 rounded px-3 py-2.5',
            collapsed && 'justify-center px-2',
          )}
        >
          <div className="h-5 w-5 shrink-0 animate-pulse rounded bg-sidebar-border" />
          {!collapsed && (
            <div
              className="h-4 animate-pulse rounded bg-sidebar-border"
              style={{ width: `${60 + (i % 3) * 20}px` }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { loading, items: filteredItems } = useFilteredNavItems();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // Tenant (organization) switcher — mirrors the construction portal footer.
  const tenants = useAuthStore((s) => s.tenants);
  const activeTenantId = useAuthStore((s) => s.activeTenantId);
  const fetchTenants = useAuthStore((s) => s.fetchTenants);
  const switchTenant = useAuthStore((s) => s.switchTenant);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  // Normalize the tenant list to a common shape; fall back to the session
  // tenant when the list endpoint returns nothing (single-tenant users).
  const displayTenants = useMemo(() => {
    if (tenants.length > 0) {
      return tenants.map((t) => ({ id: t.id, name: t.name, role: t.role, logoUrl: null as string | null }));
    }
    if (user?.tenant) {
      return [{
        id: user.tenant.id,
        name: user.tenant.name,
        role: user.tenant.roleName || 'Member',
        logoUrl: user.tenant.logoUrl,
      }];
    }
    return [];
  }, [tenants, user?.tenant]);

  const currentTenant =
    displayTenants.find((t) => t.id === activeTenantId) || displayTenants[0] || null;

  const tenantAvatar = (name: string, logoUrl: string | null, className?: string) => (
    <div
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-primary text-sm font-semibold text-primary-foreground',
        className,
      )}
    >
      {logoUrl ? (
        <img src={logoUrl} alt={name} className="h-full w-full object-contain p-0.5" />
      ) : (
        (name.charAt(0) || 'T').toUpperCase()
      )}
    </div>
  );

  // Dropdown listing the available tenants (with a "TENANT" header).
  const tenantMenu = (
    <DropdownMenuContent
      side="top"
      align="start"
      sideOffset={8}
      className="w-64 overflow-hidden p-0"
    >
      <div className="border-b border-border px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tenant
        </p>
      </div>
      <div className="max-h-[280px] overflow-y-auto py-1.5">
        {displayTenants.map((t) => {
          const isActive = t.id === activeTenantId || (!activeTenantId && t.id === currentTenant?.id);
          return (
            <DropdownMenuItem
              key={t.id}
              disabled={isActive}
              onClick={() => { if (!isActive) switchTenant(t.id); }}
              className={cn(
                'mx-1.5 cursor-pointer gap-2.5 rounded px-3 py-2.5',
                isActive
                  ? 'border border-primary/20 bg-primary/5 focus:bg-primary/5'
                  : 'border border-transparent',
              )}
            >
              {tenantAvatar(t.name, t.logoUrl)}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium leading-tight text-foreground">
                  {t.name}
                </span>
                {t.role && (
                  <span className="mt-0.5 truncate text-xs uppercase text-muted-foreground">
                    {t.role}
                  </span>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
      </div>
    </DropdownMenuContent>
  );
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => {
    // Auto-expand parent if a child route is active
    const expanded = new Set<string>();
    for (const item of filteredItems) {
      if (item.children && pathname.startsWith(item.href + '/')) {
        expanded.add(item.href);
      }
    }
    return expanded;
  });

  const toggleExpand = (href: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      return next;
    });
  };

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200',
        collapsed ? 'w-[68px]' : 'w-[240px]',
      )}
    >
      {/* Logo / brand */}
      <div
        className={cn(
          'flex h-14 items-center border-b border-sidebar-border px-4',
          collapsed && 'justify-center',
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-x-3 overflow-hidden">
          <div className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md bg-primary px-1.5 text-[11px] font-bold text-primary-foreground shadow-sm">
            3PM
          </div>
          {!collapsed && (
            <span className="brand-wordmark truncate text-lg font-bold leading-none">
              Drive
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-2">
        {loading ? (
          <NavSkeleton collapsed={collapsed} />
        ) : (
        <nav className="flex flex-col gap-1 px-2">
          {filteredItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedItems.has(item.href);

            // For items with children: button to expand, not a link
            if (hasChildren && !collapsed) {
              return (
                <div key={item.href}>
                  <button
                    onClick={() => toggleExpand(item.href)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm ring-1 ring-sidebar-primary/10'
                        : 'text-sidebar-foreground hover:bg-gray-100',
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="truncate flex-1 text-left">{item.label}</span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 transition-transform',
                        isExpanded && 'rotate-180',
                      )}
                    />
                  </button>
                  {isExpanded && (
                    <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-sidebar-border pl-3">
                      {item.children!.map((child) => {
                        const isChildActive =
                          pathname === child.href || pathname.startsWith(child.href + '/');
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              'flex items-center rounded px-3 py-1.5 text-sm transition-colors',
                              isChildActive
                                ? 'font-medium text-sidebar-primary'
                                : 'text-sidebar-foreground hover:bg-gray-100',
                            )}
                          >
                            <span className="truncate">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Standard link (no children or collapsed)
            const linkContent = (
              <Link
                key={item.href}
                href={hasChildren ? item.children![0].href : item.href}
                className={cn(
                  'flex items-center gap-3 rounded px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm ring-1 ring-sidebar-primary/10'
                    : 'text-sidebar-foreground hover:bg-gray-100',
                  collapsed && 'justify-center px-2',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return linkContent;
          })}
        </nav>
        )}
      </ScrollArea>

      {/* Footer — tenant (organization) switcher */}
      <div className="border-t border-sidebar-border p-2">
        <Separator className="mb-2" />

        {/* Collapse toggle */}
        <div className={cn('mb-1 flex', collapsed ? 'justify-center' : 'justify-end')}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center rounded p-2 text-sidebar-foreground transition-colors hover:bg-gray-100"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {currentTenant && (
          <DropdownMenu>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button className="flex w-full items-center justify-center rounded p-1 transition-colors hover:bg-primary/5">
                      {tenantAvatar(currentTenant.name, currentTenant.logoUrl)}
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {currentTenant.name}
                  {currentTenant.role ? ` · ${currentTenant.role}` : ''}
                </TooltipContent>
              </Tooltip>
            ) : (
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-2.5 rounded border border-transparent bg-primary/5 px-3 py-2.5 text-left transition-colors hover:border-primary/10 hover:bg-primary/10">
                  {tenantAvatar(currentTenant.name, currentTenant.logoUrl)}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium leading-tight text-sidebar-foreground">
                      {currentTenant.name}
                    </span>
                    {currentTenant.role && (
                      <span className="truncate text-xs uppercase leading-tight text-muted-foreground">
                        {currentTenant.role}
                      </span>
                    )}
                  </div>
                  <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
            )}
            {tenantMenu}
          </DropdownMenu>
        )}
      </div>
    </aside>
  );
}
