import {
  LayoutDashboard,
  ClipboardCheck,
  Wrench,
  Truck,
  Store,
  Fuel,
  Users,
  Settings,
} from 'lucide-react';

export interface NavChild {
  label: string;
  href: string;
  /** Module key required to see this item (checked via module view permission). */
  requiredModule?: string;
  /** SubModule key required to see this item (checked via submodule view permission). */
  requiredSubModule?: string;
}

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavChild[];
  /** Module key required to see this item (checked via module view permission). */
  requiredModule?: string;
  /** SubModule key required to see this item (checked via submodule view permission). */
  requiredSubModule?: string;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Inspections',
    href: '/inspections',
    icon: ClipboardCheck,
    children: [
      { label: 'Inspection History', href: '/inspections/history', requiredModule: 'inspections', requiredSubModule: 'inspectionHistory' },
      { label: 'Forms', href: '/inspections/forms', requiredModule: 'inspections', requiredSubModule: 'forms' },
      { label: 'Inspection Settings', href: '/inspections/defect-settings', requiredModule: 'inspections', requiredSubModule: 'defectSettings' },
      { label: 'Exception Report', href: '/inspections/exception-report', requiredModule: 'inspections', requiredSubModule: 'exceptionReport' },
    ],
  },
  {
    label: 'Maintenance',
    href: '/maintenance',
    icon: Wrench,
    children: [
      { label: 'Service Tasks', href: '/maintenance/service-tasks', requiredModule: 'maintenance', requiredSubModule: 'serviceTasks' },
      { label: 'Service Plans', href: '/maintenance/service-plans', requiredModule: 'maintenance', requiredSubModule: 'servicePlans' },
      { label: 'Asset Service Schedule', href: '/maintenance/service-schedule', requiredModule: 'maintenance', requiredSubModule: 'serviceSchedule' },
      { label: 'Work Orders', href: '/maintenance/work-orders', requiredModule: 'maintenance', requiredSubModule: 'workOrders' },
      { label: 'Defects', href: '/maintenance/defects', requiredModule: 'maintenance', requiredSubModule: 'defects' },
      { label: 'Faults', href: '/maintenance/faults', requiredModule: 'maintenance', requiredSubModule: 'faults' },
      { label: 'Purchase Orders', href: '/maintenance/purchase-orders', requiredModule: 'maintenance', requiredSubModule: 'purchaseOrders' },
      { label: 'Stock', href: '/maintenance/inventory', requiredModule: 'maintenance', requiredSubModule: 'inventory' },
    ],
  },
  { label: 'Assets', href: '/assets', icon: Truck, requiredModule: 'assets' },
  { label: 'Vendors', href: '/vendors', icon: Store, requiredModule: 'vendors' },
  { label: 'Fuel', href: '/fuel', icon: Fuel, requiredModule: 'fuel' },
  {
    label: 'People',
    href: '/people',
    icon: Users,
    children: [
      { label: 'Users', href: '/people/users', requiredModule: 'people', requiredSubModule: 'users' },
      { label: 'Teams', href: '/people/teams', requiredModule: 'people', requiredSubModule: 'teams' },
      { label: 'Drivers', href: '/people/drivers', requiredModule: 'people', requiredSubModule: 'drivers' },
      { label: 'Roles', href: '/people/roles', requiredModule: 'people', requiredSubModule: 'roles' },
    ],
  },
  { label: 'Settings', href: '/settings', icon: Settings, requiredModule: 'settings' },
];

/** Flatten all nav items + children into a searchable list. */
export function getFlatNavItems(): Array<{
  label: string;
  href: string;
  parent?: string;
  requiredModule?: string;
  requiredSubModule?: string;
}> {
  const flat: Array<{
    label: string;
    href: string;
    parent?: string;
    requiredModule?: string;
    requiredSubModule?: string;
  }> = [];
  for (const item of navItems) {
    flat.push({
      label: item.label,
      href: item.href,
      requiredModule: item.requiredModule,
      requiredSubModule: item.requiredSubModule,
    });
    if (item.children) {
      for (const child of item.children) {
        flat.push({
          label: child.label,
          href: child.href,
          parent: item.label,
          requiredModule: child.requiredModule,
          requiredSubModule: child.requiredSubModule,
        });
      }
    }
  }
  return flat;
}
