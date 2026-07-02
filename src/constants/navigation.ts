import {
  LayoutDashboard,
  ClipboardCheck,
  Wrench,
  Truck,
  Store,
  Fuel,
  Users,
} from 'lucide-react';
import type { ModuleKey } from '@/lib/rbac';

export interface NavChild {
  label: string;
  href: string;
  /** RBAC module required to see this item (checked via `view` action). */
  requiredModule?: ModuleKey;
  /** If true, only users with `scope: 'all'` (admin/owner) can see this. */
  adminOnly?: boolean;
}

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavChild[];
  /** RBAC module required to see this item (checked via `view` action). */
  requiredModule?: ModuleKey;
  /** If true, only users with `scope: 'all'` (admin/owner) can see this. */
  adminOnly?: boolean;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Inspections',
    href: '/inspections',
    icon: ClipboardCheck,
    children: [
      { label: 'Inspection History', href: '/inspections/history', requiredModule: 'inspections' },
      { label: 'Forms', href: '/inspections/forms', requiredModule: 'forms' },
      { label: 'Defect Settings', href: '/inspections/defect-settings', requiredModule: 'inspections' },
      { label: 'Exception Report', href: '/inspections/exception-report', requiredModule: 'exception_report' },
    ],
  },
  {
    label: 'Maintenance',
    href: '/maintenance',
    icon: Wrench,
    children: [
      { label: 'Service Tasks', href: '/maintenance/service-tasks', requiredModule: 'service_tasks' },
      { label: 'Service Programs', href: '/maintenance/service-programs', requiredModule: 'service_programs' },
      { label: 'Asset Service Schedule', href: '/maintenance/service-schedule', requiredModule: 'service_programs' },
      { label: 'Work Orders', href: '/maintenance/work-orders', requiredModule: 'work_order' },
      { label: 'Defects', href: '/maintenance/defects', requiredModule: 'defects' },
      { label: 'Purchase Orders', href: '/maintenance/purchase-orders', adminOnly: true },
      { label: 'Inventory', href: '/maintenance/inventory', requiredModule: 'inventory' },
    ],
  },
  { label: 'Assets', href: '/assets', icon: Truck, requiredModule: 'assets' },
  { label: 'Vendors', href: '/vendors', icon: Store, adminOnly: true },
  { label: 'Fuel', href: '/fuel', icon: Fuel, requiredModule: 'fuel' },
  {
    label: 'People',
    href: '/people',
    icon: Users,
    children: [
      { label: 'Users', href: '/people/users', adminOnly: true },
      { label: 'Teams', href: '/people/teams', requiredModule: 'teams' },
      { label: 'Drivers', href: '/people/drivers', requiredModule: 'drivers' },
      { label: 'Roles', href: '/people/roles', adminOnly: true },
    ],
  },
];

/** Flatten all nav items + children into a searchable list. */
export function getFlatNavItems(): Array<{
  label: string;
  href: string;
  parent?: string;
  requiredModule?: ModuleKey;
  adminOnly?: boolean;
}> {
  const flat: Array<{
    label: string;
    href: string;
    parent?: string;
    requiredModule?: ModuleKey;
    adminOnly?: boolean;
  }> = [];
  for (const item of navItems) {
    flat.push({
      label: item.label,
      href: item.href,
      requiredModule: item.requiredModule,
      adminOnly: item.adminOnly,
    });
    if (item.children) {
      for (const child of item.children) {
        flat.push({
          label: child.label,
          href: child.href,
          parent: item.label,
          requiredModule: child.requiredModule,
          adminOnly: child.adminOnly,
        });
      }
    }
  }
  return flat;
}
