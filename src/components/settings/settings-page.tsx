'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight, Ruler, Tag, MapPin, Factory, Wrench, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InventorySettingsList, type SettingsFieldConfig } from './inventory-settings-list';
import { WorkOrderStatusesList } from './work-order-statuses-list';

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
    key: 'inventory',
    label: 'Inventory',
    icon: Tag,
    children: [
      { key: 'measurement-units', label: 'Measurement Units' },
      { key: 'part-categories', label: 'Part Categories' },
      { key: 'part-locations', label: 'Part Locations' },
      { key: 'part-manufacturers', label: 'Part Manufacturers' },
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
  { key: 'name', label: 'Part location', type: 'text', required: true, placeholder: 'e.g. Main Warehouse' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description' },
  {
    key: 'isDefault',
    label: 'Choose as default location',
    type: 'checkbox',
    helpText: 'New parts will use this location by default.',
  },
];

const PART_MANUFACTURER_FIELDS: SettingsFieldConfig[] = [
  { key: 'name', label: 'Manufacturer name', type: 'text', required: true, placeholder: 'e.g. Bosch' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description' },
];

const VALID_SIDEBAR_KEYS = new Set(['measurement-units', 'part-categories', 'part-locations', 'part-manufacturers', 'work-order-statuses']);

export function SettingsPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>('admin');
  const [activeSidebarKey, setActiveSidebarKey] = useState('measurement-units');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(['inventory']));

  // Support deep-linking via ?section= query param
  useEffect(() => {
    const section = searchParams.get('section');
    if (section && VALID_SIDEBAR_KEYS.has(section)) {
      setActiveSidebarKey(section);
      // Expand the parent group that contains this section
      if (['measurement-units', 'part-categories', 'part-locations', 'part-manufacturers'].includes(section)) {
        setExpandedKeys((prev) => new Set([...prev, 'inventory']));
      } else if (['work-order-statuses'].includes(section)) {
        setExpandedKeys((prev) => new Set([...prev, 'work-orders']));
      }
    }
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
      case 'measurement-units':
        return (
          <InventorySettingsList
            title="Measurement Units"
            apiEndpoint="/api/inventory-settings/measurement-units"
            fields={MEASUREMENT_UNIT_FIELDS}
            createLabel="Add Unit"
            extraColumns={[{ key: 'symbol', header: 'Symbol' }]}
          />
        );
      case 'part-categories':
        return (
          <InventorySettingsList
            title="Part Categories"
            apiEndpoint="/api/inventory-settings/part-categories"
            fields={PART_CATEGORY_FIELDS}
            createLabel="Create Category"
          />
        );
      case 'part-locations':
        return (
          <InventorySettingsList
            title="Part Locations"
            apiEndpoint="/api/inventory-settings/part-locations"
            fields={PART_LOCATION_FIELDS}
            createLabel="Add Location"
          />
        );
      case 'part-manufacturers':
        return (
          <InventorySettingsList
            title="Part Manufacturers"
            apiEndpoint="/api/inventory-settings/part-manufacturers"
            fields={PART_MANUFACTURER_FIELDS}
            createLabel="Add Manufacturer"
          />
        );
      case 'work-order-statuses':
        return <WorkOrderStatusesList />;
      default:
        return null;
    }
  };

  const getIconForChild = (key: string) => {
    switch (key) {
      case 'measurement-units': return Ruler;
      case 'part-categories': return Tag;
      case 'part-locations': return MapPin;
      case 'part-manufacturers': return Factory;
      case 'work-order-statuses': return CircleDot;
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
            {ADMIN_SIDEBAR.map((item) => {
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
