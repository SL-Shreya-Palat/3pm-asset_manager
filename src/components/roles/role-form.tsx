'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { ModuleKey, Action } from '@/lib/rbac';
import type { RolePermissions, PermissionTab, RoleTemplateKey } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All available actions in display order. */
export const ALL_ACTIONS: { key: Action; label: string }[] = [
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Create' },
  { key: 'update', label: 'Update' },
  { key: 'delete', label: 'Delete' },
  { key: 'export', label: 'Export' },
  { key: 'bulkUpload', label: 'Bulk Upload' },
];

/** Permission tabs grouping modules into categories. */
export const PERMISSION_TABS: PermissionTab[] = [
  {
    key: 'assets',
    label: 'Assets',
    modules: [{ key: 'assets', label: 'Assets' }],
  },
  {
    key: 'inspections',
    label: 'Inspections',
    modules: [
      { key: 'inspections', label: 'Inspections' },
      { key: 'forms', label: 'Forms' },
      { key: 'exception_report', label: 'Exception Reports' },
    ],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    modules: [
      { key: 'defects', label: 'Defects' },
      { key: 'service_tasks', label: 'Service Tasks' },
      { key: 'service_programs', label: 'Service Programs' },
      { key: 'work_order', label: 'Work Orders' },
      { key: 'inventory', label: 'Inventory' },
    ],
  },
  {
    key: 'people',
    label: 'People',
    modules: [
      { key: 'teams', label: 'Teams' },
      { key: 'drivers', label: 'Drivers' },
      { key: 'driver_wellness', label: 'Driver Wellness' },
    ],
  },
  {
    key: 'fuel',
    label: 'Fuel',
    modules: [{ key: 'fuel', label: 'Fuel' }],
  },
  {
    key: 'settings',
    label: 'Settings',
    modules: [],
  },
];

/** All module keys for full access. */
const ALL_MODULES: ModuleKey[] = [
  'teams', 'assets', 'inspections', 'forms', 'exception_report',
  'defects', 'service_tasks', 'service_programs', 'work_order',
  'inventory', 'drivers', 'driver_wellness', 'fuel',
];

/** Build a full-access permission set for a list of modules. */
function fullAccess(modules: ModuleKey[]): Partial<Record<ModuleKey, Partial<Record<Action, boolean>>>> {
  const result: Partial<Record<ModuleKey, Partial<Record<Action, boolean>>>> = {};
  for (const mod of modules) {
    result[mod] = { view: true, create: true, update: true, delete: true, export: true, bulkUpload: true };
  }
  return result;
}

/** Build a view-only permission set for a list of modules. */
function viewOnly(modules: ModuleKey[]): Partial<Record<ModuleKey, Partial<Record<Action, boolean>>>> {
  const result: Partial<Record<ModuleKey, Partial<Record<Action, boolean>>>> = {};
  for (const mod of modules) {
    result[mod] = { view: true, create: false, update: false, delete: false, export: false, bulkUpload: false };
  }
  return result;
}

/** Role template presets. */
const ROLE_TEMPLATES: Record<RoleTemplateKey, { label: string; description: string; permissions: RolePermissions }> = {
  owner: {
    label: 'Owner',
    description: 'Full unrestricted access including billing and account settings.',
    permissions: { scope: 'all', teamScoped: false, mobileOnly: false },
  },
  admin: {
    label: 'Admin',
    description: 'Full access to all modules and settings.',
    permissions: { scope: 'all', teamScoped: false, mobileOnly: false },
  },
  manager: {
    label: 'Manager',
    description: 'Full access except creating/editing forms and user profiles.',
    permissions: {
      scope: 'modules',
      modules: {
        ...fullAccess(ALL_MODULES.filter((m) => m !== 'forms' && m !== 'drivers')),
        ...viewOnly(['forms', 'drivers']),
      },
      teamScoped: false,
      mobileOnly: false,
    },
  },
  team_manager: {
    label: 'Team Manager',
    description: 'Access to Assets, Drivers, Inspections, Defects, and Work Orders for assigned teams.',
    permissions: {
      scope: 'modules',
      modules: {
        ...fullAccess(['assets', 'drivers', 'inspections', 'defects', 'work_order']),
      },
      teamScoped: true,
      mobileOnly: false,
    },
  },
  mechanic: {
    label: 'Mechanic',
    description: 'Access to Defects and Work Orders only (Maintenance tab).',
    permissions: {
      scope: 'modules',
      modules: {
        ...fullAccess(['defects', 'work_order']),
      },
      teamScoped: false,
      mobileOnly: false,
    },
  },
  driver: {
    label: 'Driver',
    description: 'Mobile-only access for completing inspections.',
    permissions: {
      scope: 'modules',
      modules: {
        inspections: { view: true, create: true, update: false, delete: false, export: false, bulkUpload: false },
      },
      teamScoped: true,
      mobileOnly: true,
    },
  },
};

const TEMPLATE_KEYS: RoleTemplateKey[] = ['admin', 'manager', 'team_manager', 'mechanic', 'driver'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RoleFormProps {
  mode: 'create' | 'edit';
  initialData?: Record<string, unknown>;
  roleId?: string;
}

export function RoleForm({ mode, initialData, roleId }: RoleFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseCostPerHour, setBaseCostPerHour] = useState<number>(0);
  const [chargeOutRate, setChargeOutRate] = useState<number>(0);
  const [isManager, setIsManager] = useState(false);
  const [isTeamManager, setIsTeamManager] = useState(false);
  const [isMechanic, setIsMechanic] = useState(false);
  const [isDriver, setIsDriver] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<RoleTemplateKey | null>(null);

  // Permission state
  const [isFullAccess, setIsFullAccess] = useState(false);
  const [teamScoped, setTeamScoped] = useState(false);
  const [mobileOnly, setMobileOnly] = useState(false);
  const [modulePermissions, setModulePermissions] = useState<
    Partial<Record<ModuleKey, Partial<Record<Action, boolean>>>>
  >({});

  // Populate form with initial data (edit mode)
  useEffect(() => {
    if (initialData) {
      setName((initialData.name as string) || '');
      setDescription((initialData.description as string) || '');
      setBaseCostPerHour((initialData.baseCostPerHour as number) ?? 0);
      setChargeOutRate((initialData.chargeOutRate as number) ?? 0);
      const mgr = initialData.isManager === true;
      const tmgr = initialData.isTeamManager === true;
      const mech = initialData.isMechanic === true;
      const drv = initialData.isDriver === true;
      const adm = initialData.isAdmin === true;
      setIsManager(mgr);
      setIsTeamManager(tmgr);
      setIsMechanic(mech);
      setIsDriver(drv);
      setIsAdmin(adm);

      // Detect which template was originally selected
      if (adm) setSelectedTemplate('admin');
      else if (mgr) setSelectedTemplate('manager');
      else if (tmgr) setSelectedTemplate('team_manager');
      else if (mech) setSelectedTemplate('mechanic');
      else if (drv) setSelectedTemplate('driver');
      const perms = initialData.permissions as RolePermissions | undefined;
      if (perms) {
        if (perms.scope === 'all') {
          setIsFullAccess(true);
          setTeamScoped(false);
          setMobileOnly(false);
          setModulePermissions({});
        } else {
          setIsFullAccess(false);
          setTeamScoped(perms.teamScoped);
          setMobileOnly(perms.mobileOnly);
          setModulePermissions(perms.modules || {});
        }
      }
    }
  }, [initialData]);

  /** Apply a role template. */
  const applyTemplate = (key: RoleTemplateKey) => {
    setSelectedTemplate(key);
    const template = ROLE_TEMPLATES[key];
    if (template.permissions.scope === 'all') {
      setIsFullAccess(true);
      setTeamScoped(false);
      setMobileOnly(false);
      setModulePermissions({});
    } else {
      setIsFullAccess(false);
      setTeamScoped(template.permissions.teamScoped);
      setMobileOnly(template.permissions.mobileOnly);
      setModulePermissions({ ...template.permissions.modules });
    }

    // Set role type flags based on selected template
    setIsAdmin(key === 'admin');
    setIsManager(key === 'manager');
    setIsTeamManager(key === 'team_manager');
    setIsMechanic(key === 'mechanic');
    setIsDriver(key === 'driver');
  };

  /** Build the permissions payload. */
  const buildPermissions = (): RolePermissions => {
    if (isFullAccess) {
      return { scope: 'all', teamScoped: false, mobileOnly: false };
    }
    // Strip out modules with no enabled actions
    const cleaned: Partial<Record<ModuleKey, Partial<Record<Action, boolean>>>> = {};
    for (const [mod, actions] of Object.entries(modulePermissions)) {
      if (actions && Object.values(actions).some(Boolean)) {
        cleaned[mod as ModuleKey] = actions;
      }
    }
    return { scope: 'modules', modules: cleaned, teamScoped, mobileOnly };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Role name is required';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      baseCostPerHour,
      chargeOutRate,
      permissions: buildPermissions(),
      isManager,
      isTeamManager,
      isMechanic,
      isDriver,
      isAdmin,
    };

    try {
      setSaving(true);
      if (mode === 'edit' && roleId) {
        await axios.put(`/api/roles/${roleId}`, payload, { withCredentials: true });
      } else {
        await axios.post('/api/roles', payload, { withCredentials: true });
      }
      router.push('/people/roles');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const errData = err.response.data.error;
        if (typeof errData === 'object') {
          setFieldErrors(errData as Record<string, string>);
        } else {
          setError(String(errData));
        }
      } else {
        setError('Failed to save role');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 w-full">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.push('/people/roles')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {mode === 'edit' ? 'Edit Role' : 'Create Role'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {mode === 'edit'
              ? 'Update the role details and permissions below'
              : 'Define a new role with specific permissions'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Role Name & Description */}
        <div className="rounded-lg border bg-card p-5 shadow-sm mb-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Role Details</h2>
          <Separator className="mb-4" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="roleName">
                Role Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="roleName"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) setFieldErrors((prev) => { const { name: _, ...rest } = prev; return rest; });
                }}
                placeholder="e.g., Fleet Supervisor"
                className={cn('mt-1.5', fieldErrors.name && 'border-destructive')}
              />
              {fieldErrors.name && (
                <p className="text-sm text-destructive mt-1">{fieldErrors.name}</p>
              )}
            </div>
            <div>
              <Label htmlFor="roleDesc">Description</Label>
              <Textarea
                id="roleDesc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this role's purpose..."
                rows={1}
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div>
              <Label htmlFor="baseCostPerHour">Base Cost Per Hour</Label>
              <Input
                id="baseCostPerHour"
                type="number"
                min={0}
                step="0.01"
                value={baseCostPerHour}
                onChange={(e) => setBaseCostPerHour(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="chargeOutRate">Charge Out Rate</Label>
              <Input
                id="chargeOutRate"
                type="number"
                min={0}
                step="0.01"
                value={chargeOutRate}
                onChange={(e) => setChargeOutRate(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="mt-1.5"
              />
            </div>
          </div>

        </div>

        {/* Role Template Selection */}
        <div className="rounded-lg border bg-card p-5 shadow-sm mb-6">
          <h2 className="text-base font-semibold text-foreground mb-1">Role Templates</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Select a template to auto-fill permissions, or customize below.
          </p>
          <Separator className="mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {TEMPLATE_KEYS.map((key) => {
              const tpl = ROLE_TEMPLATES[key];
              const isSelected = selectedTemplate === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyTemplate(key)}
                  className={cn(
                    'flex flex-col items-start rounded-lg border p-4 text-left transition-all hover:shadow-md',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/40',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Checkbox checked={isSelected} tabIndex={-1} className="pointer-events-none" />
                    <span className="font-medium text-sm text-foreground">{tpl.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{tpl.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 mb-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push('/people/roles')} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : mode === 'edit' ? 'Update Role' : 'Create Role'}
          </Button>
        </div>
      </form>
    </div>
  );
}
