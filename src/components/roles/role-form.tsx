'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Search,
  Shield,
  Info,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { PageBackButton } from '@/components/ui/page-back-button';
import { cn } from '@/lib/utils';
import type { SparsePermissions } from '@/lib/rbac';
import type { PermissionModule, PermissionLevel, PermissionForm } from './types';
import {
  expandPermissionsForUI,
  compressPermissionsForStorage,
  buildEmptyPermissionTree,
} from './utils/permissionFormatAdapter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEVEL_CYCLE: PermissionLevel[] = ['all', 'own', 'none'];

/** A flattened form entry for the form-view table. */
type FlatForm = PermissionForm & {
  moduleKey: string;
  moduleName: string;
  subModuleKey: string;
  subModuleName: string;
  subModuleDescription?: string;
};

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
  const [teamScoped, setTeamScoped] = useState(false);
  const [mobileOnly, setMobileOnly] = useState(false);

  // Permission state
  const [grantAllPermissions, setGrantAllPermissions] = useState(false);
  const [permissionModules, setPermissionModules] = useState<PermissionModule[]>(
    () => buildEmptyPermissionTree(),
  );

  // Search
  const [permissionSearch, setPermissionSearch] = useState('');

  // Info section
  const [showInfo, setShowInfo] = useState(false);

  // Populate form with initial data (edit mode)
  useEffect(() => {
    if (initialData) {
      setName((initialData.name as string) || '');
      setDescription((initialData.description as string) || '');
      setBaseCostPerHour((initialData.baseCostPerHour as number) ?? 0);
      setChargeOutRate((initialData.chargeOutRate as number) ?? 0);
      setTeamScoped((initialData.teamScoped as boolean) ?? false);
      setMobileOnly((initialData.mobileOnly as boolean) ?? false);

      const perms = initialData.permissions as SparsePermissions | undefined;
      if (perms && perms.v === 2) {
        const isWildcard =
          Array.isArray(perms.forms) &&
          perms.forms.length === 1 &&
          perms.forms[0] === '*';
        setGrantAllPermissions(isWildcard);
        setPermissionModules(expandPermissionsForUI(perms));
      }
    }
  }, [initialData]);

  // ---------------------------------------------------------------------------
  // Flatten all forms for form-view
  // ---------------------------------------------------------------------------

  const allFlatForms = useMemo<FlatForm[]>(() => {
    const result: FlatForm[] = [];
    for (const mod of permissionModules) {
      for (const sm of mod.subModules) {
        for (const form of sm.forms) {
          result.push({
            ...form,
            moduleKey: mod.key,
            moduleName: mod.name,
            subModuleKey: sm.key,
            subModuleName: sm.name,
            subModuleDescription: sm.description,
          });
        }
      }
    }
    return result;
  }, [permissionModules]);

  // ---------------------------------------------------------------------------
  // Permission handlers
  // ---------------------------------------------------------------------------

  const updateFormPermission = useCallback(
    (
      moduleKey: string,
      subModuleKey: string,
      formKey: string,
      field: 'viewLevel' | 'create' | 'editLevel' | 'archiveLevel' | 'deleteLevel',
      value: PermissionLevel | boolean,
    ) => {
      setPermissionModules((prev) =>
        prev.map((mod) => {
          if (mod.key !== moduleKey) return mod;
          return {
            ...mod,
            subModules: mod.subModules.map((sm) => {
              if (sm.key !== subModuleKey) return sm;
              return {
                ...sm,
                forms: sm.forms.map((f) => {
                  if (f.key !== formKey) return f;
                  const updated = { ...f, [field]: value };

                  if (field === 'viewLevel' && value === 'none') {
                    updated.create = false;
                    updated.editLevel = 'none';
                    updated.archiveLevel = 'none';
                    updated.deleteLevel = 'none';
                  }
                  if (field === 'viewLevel' && value === 'own') {
                    if (updated.editLevel === 'all') updated.editLevel = 'own';
                    if (updated.archiveLevel === 'all') updated.archiveLevel = 'own';
                    if (updated.deleteLevel === 'all') updated.deleteLevel = 'own';
                  }
                  if (field === 'archiveLevel') {
                    updated.deleteLevel = value as PermissionLevel;
                  }

                  return updated;
                }),
              };
            }),
          };
        }),
      );

      // Auto-enable module/submodule view
      if (field === 'viewLevel' && value !== 'none') {
        setPermissionModules((prev) =>
          prev.map((mod) => {
            if (mod.key !== moduleKey) return mod;
            return {
              ...mod,
              view: true,
              subModules: mod.subModules.map((sm) => {
                if (sm.key !== subModuleKey) return sm;
                return { ...sm, view: true };
              }),
            };
          }),
        );
      }
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Bulk column header handlers
  // ---------------------------------------------------------------------------

  const handleBulkLevelChange = useCallback(
    (field: 'viewLevel' | 'editLevel' | 'archiveLevel' | 'deleteLevel', level: PermissionLevel) => {
      setPermissionModules((prev) =>
        prev.map((mod) => ({
          ...mod,
          view: level !== 'none' ? true : mod.view,
          subModules: mod.subModules.map((sm) => ({
            ...sm,
            view: level !== 'none' ? true : sm.view,
            forms: sm.forms.map((f) => {
              if (!f.accessibility.includes(field === 'viewLevel' ? 'view' : field === 'editLevel' ? 'edit' : field === 'archiveLevel' ? 'archive' : 'delete')) return f;
              const updated = { ...f, [field]: level };

              if (field === 'viewLevel' && level === 'none') {
                updated.create = false;
                updated.editLevel = 'none';
                updated.archiveLevel = 'none';
                updated.deleteLevel = 'none';
              }
              if (field === 'viewLevel' && level === 'own') {
                if (updated.editLevel === 'all') updated.editLevel = 'own';
                if (updated.archiveLevel === 'all') updated.archiveLevel = 'own';
                if (updated.deleteLevel === 'all') updated.deleteLevel = 'own';
              }
              if (field === 'archiveLevel') {
                updated.deleteLevel = level;
              }

              return updated;
            }),
          })),
        })),
      );
    },
    [],
  );

  const handleBulkBooleanChange = useCallback(
    (value: boolean) => {
      setPermissionModules((prev) =>
        prev.map((mod) => ({
          ...mod,
          subModules: mod.subModules.map((sm) => ({
            ...sm,
            forms: sm.forms.map((f) => {
              if (!f.accessibility.includes('create')) return f;
              if (f.viewLevel === 'none') return f;
              return { ...f, create: value };
            }),
          })),
        })),
      );
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Build payload & submit
  // ---------------------------------------------------------------------------

  const buildPermissions = (): SparsePermissions => {
    if (grantAllPermissions) {
      return { v: 2, forms: ['*'], m: ['*'], sm: [] };
    }
    return compressPermissionsForStorage(permissionModules);
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
      teamScoped,
      mobileOnly,
    };

    try {
      setSaving(true);
      if (mode === 'edit' && roleId) {
        await axios.put(`/api/roles/${roleId}`, payload, {
          withCredentials: true,
        });
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6 w-full">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <PageBackButton href="/people/roles" className="mt-1" />
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
        {/* Role Details */}
        <div className="rounded-lg border bg-card p-5 shadow-sm mb-6">
          <h2 className="text-base font-semibold text-foreground mb-4">
            Role Details
          </h2>
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
                  if (fieldErrors.name)
                    setFieldErrors((prev) => {
                      const { name: _, ...rest } = prev;
                      return rest;
                    });
                }}
                placeholder="e.g., Fleet Supervisor"
                className={cn('mt-1.5', fieldErrors.name && 'border-destructive')}
              />
              {fieldErrors.name && (
                <p className="text-sm text-destructive mt-1">
                  {fieldErrors.name}
                </p>
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
                onChange={(e) =>
                  setBaseCostPerHour(parseFloat(e.target.value) || 0)
                }
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
                onChange={(e) =>
                  setChargeOutRate(parseFloat(e.target.value) || 0)
                }
                placeholder="0"
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Flags */}
          <div className="flex items-center gap-6 mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={teamScoped}
                onCheckedChange={(v) => setTeamScoped(v === true)}
              />
              <span className="text-sm text-foreground">Team Scoped</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={mobileOnly}
                onCheckedChange={(v) => setMobileOnly(v === true)}
              />
              <span className="text-sm text-foreground">Mobile Only</span>
            </label>
          </div>
        </div>

        {/* Permissions Section */}
        <div className="rounded-lg border bg-card p-5 shadow-sm mb-6">
          <h2 className="text-base font-semibold text-foreground mb-1">
            Permissions
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Configure module and form-level access for this role.
          </p>
          <Separator className="mb-4" />

          {/* Grant All Permissions toggle */}
          <div className="rounded-md border bg-muted/30 p-3 mb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-foreground block">
                    Grant All Permissions
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Enable unrestricted access to all modules and actions
                  </span>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={grantAllPermissions}
                onClick={() => {
                  setGrantAllPermissions(!grantAllPermissions);
                  if (!grantAllPermissions) {
                    setPermissionSearch('');
                  }
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 shadow-inner cursor-pointer',
                  grantAllPermissions
                    ? 'bg-primary shadow-primary/20'
                    : 'bg-muted-foreground/30',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 rounded-full bg-white shadow-md transition-all duration-200',
                    grantAllPermissions ? 'translate-x-6' : 'translate-x-1',
                  )}
                />
              </button>
            </div>
          </div>

          {grantAllPermissions ? (
            <div className="rounded-md border-2 border-dashed border-primary/30 bg-primary/5 p-6 text-center">
              <Shield className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-primary">
                Full Access Enabled
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                This role has unrestricted access to all modules and actions.
              </p>
            </div>
          ) : (
            <>
              {/* Search & Filter Header */}
              <div className="space-y-2.5">
                {/* Header row */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-950">
                      <Search className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="flex flex-col items-start gap-0.5">
                      <h3 className="text-sm font-semibold text-foreground">
                        Search & Filter Forms
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Search and set permissions for individual forms
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Info button */}
                    <button
                      type="button"
                      onClick={() => setShowInfo(!showInfo)}
                      className={cn(
                        'flex items-center justify-center h-7 w-7 rounded-md transition-colors',
                        showInfo
                          ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      )}
                    >
                      <Info className="h-4 w-4" />
                    </button>

                    {/* Form count badge */}
                    <FormCountBadge
                      modules={permissionModules}
                      searchQuery={permissionSearch}
                    />
                  </div>
                </div>

                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search forms by name..."
                    value={permissionSearch}
                    onChange={(e) => setPermissionSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
              </div>

              {/* Info Section */}
              {showInfo && <PermissionInfoSection />}

              {/* Form View (grouped by module / submodule) */}
              <FormViewTable
                flatForms={allFlatForms}
                searchQuery={permissionSearch}
                onFormPermissionChange={updateFormPermission}
                onBulkLevelChange={handleBulkLevelChange}
                onBulkBooleanChange={handleBulkBooleanChange}
              />
            </>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 mb-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/people/roles')}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving
              ? 'Saving...'
              : mode === 'edit'
                ? 'Update Role'
                : 'Create Role'}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form Count Badge
// ---------------------------------------------------------------------------

function FormCountBadge({
  modules,
  searchQuery,
}: {
  modules: PermissionModule[];
  searchQuery: string;
}) {
  const total = modules.reduce(
    (sum, mod) => sum + mod.subModules.reduce((s, sm) => s + sm.forms.length, 0),
    0,
  );
  const q = searchQuery.toLowerCase().trim();
  let matching = total;
  if (q) {
    matching = modules.reduce((sum, mod) => {
      return (
        sum +
        mod.subModules.reduce((s, sm) => {
          return (
            s +
            sm.forms.filter(
              (f) =>
                f.name.toLowerCase().includes(q) ||
                sm.name.toLowerCase().includes(q) ||
                mod.name.toLowerCase().includes(q),
            ).length
          );
        }, 0)
      );
    }, 0);
  }

  return (
    <span className="inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-semibold bg-blue-50 text-foreground border border-blue-200 dark:bg-blue-950/50 dark:border-blue-800">
      <span className="font-bold text-blue-600 dark:text-blue-400">{matching}</span>
      <span className="mx-1 text-muted-foreground">/</span>
      <span className="text-muted-foreground">{total}</span>
      <span className="ml-1.5 text-muted-foreground">forms</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Permission Info Section
// ---------------------------------------------------------------------------

function PermissionInfoSection() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-md p-2.5 mt-3 dark:bg-blue-950/50 dark:border-blue-800">
      <div className="flex items-center gap-3 text-xs text-blue-700 flex-wrap dark:text-blue-300">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-blue-800 dark:text-blue-200">All:</span>
          <span>Access to all records</span>
        </div>
        <div className="h-3 w-px bg-blue-300/60 dark:bg-blue-700" />
        <div className="flex items-center gap-1">
          <span className="font-semibold text-blue-800 dark:text-blue-200">Own:</span>
          <span>Access to own records only</span>
        </div>
        <div className="h-3 w-px bg-blue-300/60 dark:bg-blue-700" />
        <div className="flex items-center gap-1">
          <span className="font-semibold text-blue-800 dark:text-blue-200">None:</span>
          <span>No access</span>
        </div>
        <div className="h-3 w-px bg-blue-300/60 dark:bg-blue-700" />
        <div className="flex items-center gap-1">
          <span className="font-semibold text-blue-800 dark:text-blue-200">Yes/No:</span>
          <span>Boolean permission (create)</span>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-blue-200/60 text-xs text-blue-600 dark:border-blue-800 dark:text-blue-400">
        <span className="font-semibold text-blue-800 dark:text-blue-200">Note:</span>{' '}
        Changing Archive/Unarchive level automatically updates Delete to the same level. Delete can be changed independently without affecting Archive/Unarchive.
        <span className="ml-1.5 font-semibold text-blue-800 dark:text-blue-200">Mix:</span>{' '}
        Shown when forms have different permission levels in a column.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aggregate helpers for bulk column header state
// ---------------------------------------------------------------------------

function calculateColumnLevelState(
  forms: FlatForm[],
  field: 'viewLevel' | 'editLevel' | 'archiveLevel' | 'deleteLevel',
  accessKey: string,
): PermissionLevel | 'mix' {
  const applicable = forms.filter((f) => f.accessibility.includes(accessKey));
  if (applicable.length === 0) return 'none';
  const first = applicable[0][field];
  const allSame = applicable.every((f) => f[field] === first);
  return allSame ? first : 'mix';
}

function calculateColumnBooleanState(
  forms: FlatForm[],
): boolean | 'mix' {
  const applicable = forms.filter((f) => f.accessibility.includes('create'));
  if (applicable.length === 0) return false;
  const first = applicable[0].create;
  const allSame = applicable.every((f) => f.create === first);
  return allSame ? first : 'mix';
}

function calculateFormOverallLevel(form: FlatForm): PermissionLevel | 'mix' {
  const levels: PermissionLevel[] = [];
  if (form.accessibility.includes('view')) levels.push(form.viewLevel);
  if (form.accessibility.includes('edit')) levels.push(form.editLevel);
  if (form.accessibility.includes('archive')) levels.push(form.archiveLevel);
  if (form.accessibility.includes('delete')) levels.push(form.deleteLevel);
  if (levels.length === 0) return 'none';
  const first = levels[0];
  return levels.every((l) => l === first) ? first : 'mix';
}

// ---------------------------------------------------------------------------
// Form View Table (flat list matching construction portal)
// ---------------------------------------------------------------------------

/** Group flat forms by module then submodule for rendering with section headers. */
type GroupedModule = {
  moduleKey: string;
  moduleName: string;
  subModules: {
    subModuleKey: string;
    subModuleName: string;
    subModuleDescription?: string;
    forms: FlatForm[];
  }[];
};

function groupFormsByModule(forms: FlatForm[]): GroupedModule[] {
  const map = new Map<string, Map<string, FlatForm[]>>();
  const moduleNames = new Map<string, string>();
  const smNames = new Map<string, string>();
  const smDescriptions = new Map<string, string | undefined>();
  // Preserve insertion order
  const moduleOrder: string[] = [];

  for (const f of forms) {
    if (!map.has(f.moduleKey)) {
      map.set(f.moduleKey, new Map());
      moduleOrder.push(f.moduleKey);
    }
    moduleNames.set(f.moduleKey, f.moduleName);

    const smMap = map.get(f.moduleKey)!;
    if (!smMap.has(f.subModuleKey)) {
      smMap.set(f.subModuleKey, []);
    }
    smNames.set(f.subModuleKey, f.subModuleName);
    smDescriptions.set(f.subModuleKey, f.subModuleDescription);
    smMap.get(f.subModuleKey)!.push(f);
  }

  return moduleOrder.map((mk) => ({
    moduleKey: mk,
    moduleName: moduleNames.get(mk)!,
    subModules: Array.from(map.get(mk)!.entries()).map(([sk, forms]) => ({
      subModuleKey: sk,
      subModuleName: smNames.get(sk)!,
      subModuleDescription: smDescriptions.get(sk),
      forms,
    })),
  }));
}

function FormViewTable({
  flatForms,
  searchQuery,
  onFormPermissionChange,
  onBulkLevelChange,
  onBulkBooleanChange,
}: {
  flatForms: FlatForm[];
  searchQuery: string;
  onFormPermissionChange: (
    moduleKey: string,
    subModuleKey: string,
    formKey: string,
    field: 'viewLevel' | 'create' | 'editLevel' | 'archiveLevel' | 'deleteLevel',
    value: PermissionLevel | boolean,
  ) => void;
  onBulkLevelChange: (field: 'viewLevel' | 'editLevel' | 'archiveLevel' | 'deleteLevel', level: PermissionLevel) => void;
  onBulkBooleanChange: (value: boolean) => void;
}) {
  const q = searchQuery.toLowerCase().trim();
  const filteredForms = q
    ? flatForms.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.moduleName.toLowerCase().includes(q) ||
          f.subModuleName.toLowerCase().includes(q),
      )
    : flatForms;

  const grouped = groupFormsByModule(filteredForms);

  // Column header aggregate states
  const viewState = calculateColumnLevelState(filteredForms, 'viewLevel', 'view');
  const createState = calculateColumnBooleanState(filteredForms);
  const editState = calculateColumnLevelState(filteredForms, 'editLevel', 'edit');
  const archiveState = calculateColumnLevelState(filteredForms, 'archiveLevel', 'archive');
  const deleteState = calculateColumnLevelState(filteredForms, 'deleteLevel', 'delete');

  return (
    <div className="mt-3 rounded-md border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">
                Form Name
              </th>
              <th className="text-center px-2 py-2.5 min-w-[100px]">
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                    View
                  </span>
                  <PermissionLevelButton
                    value={viewState === 'mix' ? 'none' : viewState}
                    isMix={viewState === 'mix'}
                    onChange={(v) => onBulkLevelChange('viewLevel', v)}
                  />
                </div>
              </th>
              <th className="text-center px-2 py-2.5 min-w-[100px]">
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                    Create
                  </span>
                  <PermissionBooleanButton
                    value={createState === 'mix' ? false : createState}
                    isMix={createState === 'mix'}
                    onChange={(v) => onBulkBooleanChange(v)}
                  />
                </div>
              </th>
              <th className="text-center px-2 py-2.5 min-w-[100px]">
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                    Update
                  </span>
                  <PermissionLevelButton
                    value={editState === 'mix' ? 'none' : editState}
                    isMix={editState === 'mix'}
                    onChange={(v) => onBulkLevelChange('editLevel', v)}
                  />
                </div>
              </th>
              <th className="text-center px-2 py-2.5 min-w-[120px]">
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                    Archive/Unarchive
                  </span>
                  <PermissionLevelButton
                    value={archiveState === 'mix' ? 'none' : archiveState}
                    isMix={archiveState === 'mix'}
                    onChange={(v) => onBulkLevelChange('archiveLevel', v)}
                  />
                </div>
              </th>
              <th className="text-center px-2 py-2.5 min-w-[100px]">
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                    Delete
                  </span>
                  <PermissionLevelButton
                    value={deleteState === 'mix' ? 'none' : deleteState}
                    isMix={deleteState === 'mix'}
                    onChange={(v) => onBulkLevelChange('deleteLevel', v)}
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((mod) => (
              <ModuleGroup
                key={mod.moduleKey}
                group={mod}
                onFormPermissionChange={onFormPermissionChange}
              />
            ))}
            {filteredForms.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  No forms matching &ldquo;{searchQuery}&rdquo;
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Renders a module header row + its submodule groups inside the table body. */
function ModuleGroup({
  group,
  onFormPermissionChange,
}: {
  group: GroupedModule;
  onFormPermissionChange: (
    moduleKey: string,
    subModuleKey: string,
    formKey: string,
    field: 'viewLevel' | 'create' | 'editLevel' | 'archiveLevel' | 'deleteLevel',
    value: PermissionLevel | boolean,
  ) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const formCount = group.subModules.reduce((sum, sm) => sum + sm.forms.length, 0);

  return (
    <>
      {/* Module header row */}
      <tr
        className="bg-muted/70 border-t cursor-pointer select-none hover:bg-muted transition-colors"
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <td colSpan={6} className="px-3 py-2">
          <div className="flex items-center gap-2">
            {collapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className="font-semibold text-sm text-foreground">
              {group.moduleName}
            </span>
            <span className="text-xs text-muted-foreground">
              ({formCount} {formCount === 1 ? 'form' : 'forms'})
            </span>
          </div>
        </td>
      </tr>

      {!collapsed &&
        group.subModules.map((sm) => {
          const showSubModuleHeader = sm.subModuleName !== group.moduleName;

          return (
            <SubModuleGroup
              key={sm.subModuleKey}
              moduleKey={group.moduleKey}
              subModuleKey={sm.subModuleKey}
              subModuleName={sm.subModuleName}
              subModuleDescription={sm.subModuleDescription}
              showHeader={showSubModuleHeader}
              forms={sm.forms}
              onFormPermissionChange={onFormPermissionChange}
            />
          );
        })}
    </>
  );
}

/** Renders an optional submodule header row + its form rows. */
function SubModuleGroup({
  moduleKey,
  subModuleKey,
  subModuleName,
  subModuleDescription,
  showHeader,
  forms,
  onFormPermissionChange,
}: {
  moduleKey: string;
  subModuleKey: string;
  subModuleName: string;
  subModuleDescription?: string;
  showHeader: boolean;
  forms: FlatForm[];
  onFormPermissionChange: (
    moduleKey: string,
    subModuleKey: string,
    formKey: string,
    field: 'viewLevel' | 'create' | 'editLevel' | 'archiveLevel' | 'deleteLevel',
    value: PermissionLevel | boolean,
  ) => void;
}) {
  return (
    <>
      {forms.map((form) => {
        const overall = calculateFormOverallLevel(form);

        return (
          <tr
            key={`${moduleKey}.${subModuleKey}.${form.key}`}
            className="border-t hover:bg-muted/20 transition-colors"
          >
            {/* Form Name with overall badge */}
            <td className="px-3 py-2 pl-9">
              <div className="flex items-center gap-2.5">
                <PermissionLevelButton
                  value={overall === 'mix' ? 'none' : overall}
                  isMix={overall === 'mix'}
                  onChange={(level) => {
                    if (form.accessibility.includes('view'))
                      onFormPermissionChange(moduleKey, subModuleKey, form.key, 'viewLevel', level);
                    if (form.accessibility.includes('edit'))
                      onFormPermissionChange(moduleKey, subModuleKey, form.key, 'editLevel', level);
                    if (form.accessibility.includes('archive'))
                      onFormPermissionChange(moduleKey, subModuleKey, form.key, 'archiveLevel', level);
                    if (form.accessibility.includes('delete'))
                      onFormPermissionChange(moduleKey, subModuleKey, form.key, 'deleteLevel', level);
                    if (form.accessibility.includes('create'))
                      onFormPermissionChange(moduleKey, subModuleKey, form.key, 'create', level !== 'none');
                  }}
                />
                <div className="min-w-0">
                  <span className="font-medium text-sm text-foreground truncate block">
                    {form.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground/70 truncate block">
                    {form.moduleName} › {form.subModuleName}
                  </span>
                </div>
              </div>
            </td>

            {/* View */}
            <td className="text-center px-2 py-2">
              {form.accessibility.includes('view') ? (
                <div className="flex justify-center">
                  <PermissionLevelButton
                    value={form.viewLevel}
                    onChange={(v) =>
                      onFormPermissionChange(moduleKey, subModuleKey, form.key, 'viewLevel', v)
                    }
                  />
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground italic">N/A</span>
              )}
            </td>

            {/* Create */}
            <td className="text-center px-2 py-2">
              {form.accessibility.includes('create') ? (
                <div className="flex justify-center">
                  <PermissionBooleanButton
                    value={form.create}
                    disabled={form.viewLevel === 'none'}
                    onChange={(v) =>
                      onFormPermissionChange(moduleKey, subModuleKey, form.key, 'create', v)
                    }
                  />
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground italic">N/A</span>
              )}
            </td>

            {/* Update/Edit */}
            <td className="text-center px-2 py-2">
              {form.accessibility.includes('edit') ? (
                <div className="flex justify-center">
                  <PermissionLevelButton
                    value={form.editLevel}
                    disabled={form.viewLevel === 'none'}
                    maxLevel={form.viewLevel}
                    onChange={(v) =>
                      onFormPermissionChange(moduleKey, subModuleKey, form.key, 'editLevel', v)
                    }
                  />
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground italic">N/A</span>
              )}
            </td>

            {/* Archive/Unarchive */}
            <td className="text-center px-2 py-2">
              {form.accessibility.includes('archive') ? (
                <div className="flex justify-center">
                  <PermissionLevelButton
                    value={form.archiveLevel}
                    disabled={form.viewLevel === 'none'}
                    maxLevel={form.viewLevel}
                    onChange={(v) =>
                      onFormPermissionChange(moduleKey, subModuleKey, form.key, 'archiveLevel', v)
                    }
                  />
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground italic">N/A</span>
              )}
            </td>

            {/* Delete */}
            <td className="text-center px-2 py-2">
              {form.accessibility.includes('delete') ? (
                <div className="flex justify-center">
                  <PermissionLevelButton
                    value={form.deleteLevel}
                    disabled={form.viewLevel === 'none'}
                    maxLevel={form.viewLevel}
                    onChange={(v) =>
                      onFormPermissionChange(moduleKey, subModuleKey, form.key, 'deleteLevel', v)
                    }
                  />
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground italic">N/A</span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Permission Level Button (cycles All → Own → None on click)
// ---------------------------------------------------------------------------

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  all: 'All',
  own: 'Own',
  none: 'None',
};

function PermissionLevelButton({
  value,
  disabled,
  maxLevel,
  isMix,
  onChange,
}: {
  value: PermissionLevel;
  disabled?: boolean;
  maxLevel?: PermissionLevel;
  isMix?: boolean;
  onChange: (value: PermissionLevel) => void;
}) {
  const allowed = LEVEL_CYCLE.filter((lvl) => {
    if (!maxLevel || maxLevel === 'all') return true;
    if (maxLevel === 'own') return lvl !== 'all';
    return lvl === 'none';
  });

  const handleClick = () => {
    if (disabled) return;
    if (isMix) {
      onChange('all');
      return;
    }
    const currentIdx = allowed.indexOf(value);
    const nextIdx = (currentIdx + 1) % allowed.length;
    onChange(allowed[nextIdx]);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center h-7 min-w-[60px] px-2 rounded border text-xs font-medium transition-all select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'cursor-pointer',
        isMix &&
          'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300 dark:hover:bg-violet-900',
        !isMix && value === 'all' &&
          'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-700 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900',
        !isMix && value === 'own' &&
          'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900',
        !isMix && value === 'none' &&
          'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 dark:hover:bg-slate-800',
      )}
    >
      {isMix ? 'Mix' : LEVEL_LABELS[value]}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Permission Boolean Button (toggles Yes / No on click)
// ---------------------------------------------------------------------------

function PermissionBooleanButton({
  value,
  disabled,
  isMix,
  onChange,
}: {
  value: boolean;
  disabled?: boolean;
  isMix?: boolean;
  onChange: (value: boolean) => void;
}) {
  const handleClick = () => {
    if (disabled) return;
    if (isMix) {
      onChange(true);
      return;
    }
    onChange(!value);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center h-7 min-w-[60px] px-2 rounded border text-xs font-medium transition-all select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'cursor-pointer',
        isMix &&
          'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300 dark:hover:bg-violet-900',
        !isMix && value &&
          'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-700 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900',
        !isMix && !value &&
          'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 dark:hover:bg-slate-800',
      )}
    >
      {isMix ? 'Mix' : value ? 'Yes' : 'No'}
    </button>
  );
}
