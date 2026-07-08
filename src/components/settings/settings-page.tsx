'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight, Ruler, Tag, MapPin, Wrench, CircleDot, Box, Layers, Bell, Cable, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InventorySettingsList, type SettingsFieldConfig } from './inventory-settings-list';
import { WorkOrderStatusesList } from './work-order-statuses-list';
import { Permissions } from '@/consts/permissions';
import { NotificationSettingsPage } from './notification-settings-page';
import { CommandConnectionPanel } from './command-connection-panel';
import { IoTSettingsPanel } from './iot-settings-panel';
import { useRoleAccess } from '@/hooks/use-role-access';

/** Settings tabs. */
const TABS = [
  { key: 'admin', label: 'Admin Settings' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** Admin Settings left sidebar items. */
interface SidebarItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: Array<{ key: string; label: string }>;
}

const ADMIN_SIDEBAR: SidebarItem[] = [
  {
    key: 'assets',
    label: 'Assets',
    icon: Box,
    children: [
      { key: 'asset-types', label: 'Asset Types' },
    ],
  },
  {
    key: 'inventory',
    label: 'Stock',
    icon: Tag,
    children: [
      { key: 'measurement-units', label: 'Measurement Units' },
      { key: 'part-categories', label: 'Stock Categories' },
      { key: 'part-locations', label: 'Stock Locations' },
    ],
  },
  {
    key: 'work-orders',
    label: 'Work Orders',
    icon: Wrench,
    children: [
      { key: 'work-order-statuses', label: 'Work Order Statuses' },
    ],
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: Bell,
    children: [
      { key: 'notification-routing', label: 'Routing' },
    ],
  },
  {
    key: 'connections',
    label: 'Connections',
    icon: Cable,
    children: [
      { key: 'command-connection', label: 'Command' },
    ],
  },
  {
    key: 'integrations',
    label: 'Integrations',
    icon: Radio,
    children: [
      { key: 'iot-hub', label: 'IoT Hub' },
    ],
  },
];

// Field configs for each settings type
const MEASUREMENT_UNIT_FIELDS: SettingsFieldConfig[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Kilogram' },
  { key: 'symbol', label: 'Symbol', type: 'text', required: true, placeholder: 'e.g. kg' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description' },
];

const PART_CATEGORY_FIELDS: SettingsFieldConfig[] = [
  { key: 'name', label: 'Category name', type: 'text', required: true, placeholder: 'e.g. Engine Parts' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description' },
];

const PART_LOCATION_FIELDS: SettingsFieldConfig[] = [
  { key: 'name', label: 'Part location', type: 'address', required: true, placeholder: 'Search address...' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description' },
  {
    key: 'isDefault',
    label: 'Choose as default location',
    type: 'checkbox',
    helpText: 'New parts will use this location by default.',
  },
];

const ASSET_TYPE_FIELDS: SettingsFieldConfig[] = [
  { key: 'name', label: 'Asset type name', type: 'text', required: true, placeholder: 'e.g. Vehicle' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description' },
];

const VALID_SIDEBAR_KEYS = new Set(['asset-types', 'measurement-units', 'part-categories', 'part-locations', 'work-order-statuses', 'notification-routing', 'command-connection', 'iot-hub']);

/**
 * Maps sidebar child keys to their [module, subModule, formId] tuple for
 * permission checks.  Items not in this map are always visible.
 *
 * The formId is used as a secondary check: even if the submodule is present
 * in the sm set, the item is hidden when its form-level view is NONE.
 */
const SIDEBAR_PERMISSION_MAP: Record<string, [string, string, string]> = {
  'asset-types':          ['settings', 'assetTypes',        'settings.assetTypes.assetType'],
  'measurement-units':    ['settings', 'measurementUnits',  'settings.measurementUnits.measurementUnit'],
  'part-categories':      ['settings', 'partCategories',    'settings.partCategories.partCategory'],
  'part-locations':       ['settings', 'partLocations',     'settings.partLocations.partLocation'],
  'work-order-statuses':  ['settings', 'workOrderStatuses', 'settings.workOrderStatuses.workOrderStatus'],
  'notification-routing': ['settings', 'notifications',     'settings.notifications.notification'],
  'command-connection':    ['settings', 'connections',       'settings.connections.connection'],
  'iot-hub':              ['settings', 'integrations',      'settings.integrations.integration'],
};

export function SettingsPage() {
  const searchParams = useSearchParams();
  const { hasFullAccess, canAccessSubModule, permissionIndex } = useRoleAccess();
  const [activeTab, setActiveTab] = useState<TabKey>('admin');
  const [activeSidebarKey, setActiveSidebarKey] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(['inventory']));

  // Filter sidebar items based on submodule-level AND form-level view permissions.
  const visibleSidebar = useMemo(() => {
    if (hasFullAccess) return ADMIN_SIDEBAR;

    return ADMIN_SIDEBAR
      .map((group) => {
        if (!group.children) return group;
        const visibleChildren = group.children.filter((child) => {
          const perm = SIDEBAR_PERMISSION_MAP[child.key];
          // No mapping → always visible
          if (!perm) return true;
          // Check submodule-level access
          if (!canAccessSubModule(perm[0], perm[1])) return false;
          // Also verify the form-level view is not NONE (handles stale sm data)
          return permissionIndex.getViewLevel(perm[2]) !== 'NONE';
        });
        if (visibleChildren.length === 0) return null;
        return { ...group, children: visibleChildren };
      })
      .filter(Boolean) as SidebarItem[];
  }, [hasFullAccess, canAccessSubModule, permissionIndex]);

  // Auto-select the first visible sidebar item when the list changes or on
  // initial render.
  useEffect(() => {
    const firstChild = visibleSidebar.flatMap((g) => g.children ?? []);
    if (firstChild.length > 0 && !firstChild.some((c) => c.key === activeSidebarKey)) {
      setActiveSidebarKey(firstChild[0].key);
      // expand the parent group
      const parentGroup = visibleSidebar.find((g) => g.children?.some((c) => c.key === firstChild[0].key));
      if (parentGroup) setExpandedKeys((prev) => new Set([...prev, parentGroup.key]));
    }
  }, [visibleSidebar]); // eslint-disable-line react-hooks/exhaustive-deps

  // Support deep-linking via ?section= query param.
  // Deferred so setState isn't called synchronously inside the effect body.
  useEffect(() => {
    const section = searchParams.get('section');
    if (!section || !VALID_SIDEBAR_KEYS.has(section)) return;
    const t = setTimeout(() => {
      setActiveSidebarKey(section);
      // Expand the parent group that contains this section
      if (['asset-types'].includes(section)) {
        setExpandedKeys((prev) => new Set([...prev, 'assets']));
      } else if (['measurement-units', 'part-categories', 'part-locations'].includes(section)) {
        setExpandedKeys((prev) => new Set([...prev, 'inventory']));
      } else if (['work-order-statuses'].includes(section)) {
        setExpandedKeys((prev) => new Set([...prev, 'work-orders']));
      } else if (['notification-routing'].includes(section)) {
        setExpandedKeys((prev) => new Set([...prev, 'notifications']));
      } else if (['command-connection'].includes(section)) {
        setExpandedKeys((prev) => new Set([...prev, 'connections']));
      } else if (['iot-hub'].includes(section)) {
        setExpandedKeys((prev) => new Set([...prev, 'integrations']));
      }
    }, 0);
    return () => clearTimeout(t);
  }, [searchParams]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderSettingsContent = () => {
    switch (activeSidebarKey) {
      case 'asset-types':
        return (
          <InventorySettingsList
            title="Asset Types"
            apiEndpoint="/api/inventory-settings/asset-types"
            fields={ASSET_TYPE_FIELDS}
            createLabel="Add Asset Type"
            permissions={{
              create: Permissions.settings.assetTypes.form.create,
              edit: Permissions.settings.assetTypes.form.edit,
              archive: Permissions.settings.assetTypes.form.archive,
              delete: Permissions.settings.assetTypes.form.delete,
            }}
          />
        );
      case 'measurement-units':
        return (
          <InventorySettingsList
            title="Measurement Units"
            apiEndpoint="/api/inventory-settings/measurement-units"
            fields={MEASUREMENT_UNIT_FIELDS}
            createLabel="Add Unit"
            extraColumns={[{ key: 'symbol', header: 'Symbol' }]}
            permissions={{
              create: Permissions.settings.measurementUnits.form.create,
              edit: Permissions.settings.measurementUnits.form.edit,
              archive: Permissions.settings.measurementUnits.form.archive,
              delete: Permissions.settings.measurementUnits.form.delete,
            }}
          />
        );
      case 'part-categories':
        return (
          <InventorySettingsList
            title="Stock Categories"
            apiEndpoint="/api/inventory-settings/part-categories"
            fields={PART_CATEGORY_FIELDS}
            createLabel="Create Category"
            permissions={{
              create: Permissions.settings.partCategories.form.create,
              edit: Permissions.settings.partCategories.form.edit,
              archive: Permissions.settings.partCategories.form.archive,
              delete: Permissions.settings.partCategories.form.delete,
            }}
          />
        );
      case 'part-locations':
        return (
          <InventorySettingsList
            title="Stock Locations"
            apiEndpoint="/api/inventory-settings/part-locations"
            fields={PART_LOCATION_FIELDS}
            createLabel="Add Location"
            permissions={{
              create: Permissions.settings.partLocations.form.create,
              edit: Permissions.settings.partLocations.form.edit,
              archive: Permissions.settings.partLocations.form.archive,
              delete: Permissions.settings.partLocations.form.delete,
            }}
          />
        );
      case 'work-order-statuses':
        return <WorkOrderStatusesList />;
      case 'notification-routing':
        return <NotificationSettingsPage />;
      case 'command-connection':
        return <CommandConnectionPanel />;
      case 'iot-hub':
        return <IoTSettingsPanel />;
      default:
        return null;
    }
  };

  const getIconForChild = (key: string) => {
    switch (key) {
      case 'asset-types': return Layers;
      case 'measurement-units': return Ruler;
      case 'part-categories': return Tag;
      case 'part-locations': return MapPin;
      case 'work-order-statuses': return CircleDot;
      case 'notification-routing': return Bell;
      case 'command-connection': return Cable;
      case 'iot-hub': return Radio;
      default: return Tag;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="px-6 border-b border-border">
        <div className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'pb-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-[240px] border-r border-border bg-muted/30 overflow-y-auto py-4">
          <nav className="px-3 space-y-1">
            {visibleSidebar.map((item) => {
              const isExpanded = expandedKeys.has(item.key);
              const Icon = item.icon;

              return (
                <div key={item.key}>
                  <button
                    onClick={() => toggleExpand(item.key)}
                    className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.children && (
                      isExpanded
                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                  {item.children && isExpanded && (
                    <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3">
                      {item.children.map((child) => {
                        const ChildIcon = getIconForChild(child.key);
                        return (
                          <button
                            key={child.key}
                            onClick={() => setActiveSidebarKey(child.key)}
                            className={cn(
                              'flex items-center gap-2 w-full rounded-md px-3 py-1.5 text-sm transition-colors',
                              activeSidebarKey === child.key
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                            )}
                          >
                            <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                            {child.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-6">
          {renderSettingsContent()}
        </div>
      </div>
    </div>
  );
}
