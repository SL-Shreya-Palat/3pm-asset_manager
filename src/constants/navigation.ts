import {
  LayoutDashboard,
  ClipboardCheck,
  Wrench,
  Truck,
  Store,
  Fuel,
  Users,
} from 'lucide-react';

export interface NavChild {
  label: string;
  href: string;
  /** Module key required to see this item (checked via module view permission). */
  requiredModule?: string;
  /** If true, only users with full access (admin/owner) can see this. */
  adminOnly?: boolean;
}

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavChild[];
  /** Module key required to see this item (checked via module view permission). */
  requiredModule?: string;
  /** If true, only users with full access (admin/owner) can see this. */
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
      { label: 'Forms', href: '/inspections/forms', requiredModule: 'inspections' },
      { label: 'Defect Settings', href: '/inspections/defect-settings', requiredModule: 'inspections' },
      { label: 'Exception Report', href: '/inspections/exception-report', requiredModule: 'inspections' },
    ],
  },
  {
    label: 'Maintenance',
    href: '/maintenance',
    icon: Wrench,
    children: [
      { label: 'Service Tasks', href: '/maintenance/service-tasks', requiredModule: 'maintenance' },
      { label: 'Service Programs', href: '/maintenance/service-programs', requiredModule: 'maintenance' },
      { label: 'Asset Service Schedule', href: '/maintenance/service-schedule', requiredModule: 'maintenance' },
      { label: 'Work Orders', href: '/maintenance/work-orders', requiredModule: 'maintenance' },
      { label: 'Defects', href: '/maintenance/defects', requiredModule: 'maintenance' },
      { label: 'Faults', href: '/maintenance/faults', requiredModule: 'maintenance' },
      { label: 'Purchase Orders', href: '/maintenance/purchase-orders', adminOnly: true },
      { label: 'Inventory', href: '/maintenance/inventory', requiredModule: 'maintenance' },
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
      { label: 'Teams', href: '/people/teams', requiredModule: 'people' },
      { label: 'Drivers', href: '/people/drivers', requiredModule: 'people' },
      { label: 'Roles', href: '/people/roles', adminOnly: true },
    ],
  },
];

/** Flatten all nav items + children into a searchable list. */
export function getFlatNavItems(): Array<{
  label: string;
  href: string;
  parent?: string;
  requiredModule?: string;
  adminOnly?: boolean;
}> {
  const flat: Array<{
    label: string;
    href: string;
    parent?: string;
    requiredModule?: string;
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
