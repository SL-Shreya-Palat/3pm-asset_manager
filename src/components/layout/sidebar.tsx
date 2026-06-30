'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardCheck,
  Wrench,
  Truck,
  Store,
  Fuel,
  Users,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface NavChild {
  label: string;
  href: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavChild[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Inspections',
    href: '/inspections',
    icon: ClipboardCheck,
    children: [
      { label: 'Inspection History', href: '/inspections/history' },
      { label: 'Forms', href: '/inspections/forms' },
      { label: 'Exception Report', href: '/inspections/exception-report' },
    ],
  },
  {
    label: 'Maintenance',
    href: '/maintenance',
    icon: Wrench,
    children: [
      { label: 'Service Tasks', href: '/maintenance/service-tasks' },
      { label: 'Service Programs', href: '/maintenance/service-programs' },
      { label: 'Service Schedule', href: '/maintenance/service-schedule' },
      { label: 'Work Orders', href: '/maintenance/work-orders' },
      { label: 'Defects', href: '/maintenance/defects' },
      { label: 'Purchase Orders', href: '/maintenance/purchase-orders' },
      { label: 'Inventory', href: '/maintenance/inventory' },
    ],
  },
  { label: 'Assets', href: '/assets', icon: Truck },
  { label: 'Vendors', href: '/vendors', icon: Store },
  { label: 'Fuel', href: '/fuel', icon: Fuel },
  {
    label: 'People',
    href: '/people',
    icon: Users,
    children: [
      { label: 'Users', href: '/people/users' },
      { label: 'Teams', href: '/people/teams' },
      { label: 'Drivers', href: '/people/drivers' },
      { label: 'Roles', href: '/people/roles' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => {
    // Auto-expand parent if a child route is active
    const expanded = new Set<string>();
    for (const item of navItems) {
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
      <div className="flex h-14 items-center px-4 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            AM
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold text-sidebar-foreground truncate">
              Asset Manager
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-2">
        <nav className="flex flex-col gap-1 px-2">
          {navItems.map((item) => {
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
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors w-full',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-primary'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    )}
                  >
                    <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-sidebar-primary')} />
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
                              'flex items-center rounded-md px-3 py-1.5 text-sm transition-colors',
                              isChildActive
                                ? 'font-medium text-sidebar-primary'
                                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
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
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  collapsed && 'justify-center px-2',
                )}
              >
                <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-sidebar-primary')} />
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
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2">
        <Separator className="mb-2" />
        <div className="flex items-center justify-between">
          {!collapsed && (
            <a
              href="/api/auth/logout"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors flex-1"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </a>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'flex items-center justify-center rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent transition-colors',
              collapsed && 'w-full',
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
