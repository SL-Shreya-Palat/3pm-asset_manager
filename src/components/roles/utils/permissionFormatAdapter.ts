/**
 * Two-way conversion between the UI permission state (hierarchical) and the
 * storage format (SparsePermissions).
 *
 * UI format:  PermissionModule[] — nested modules → subModules → forms
 * Storage:    SparsePermissions   — flat list of form grants + module/sm sets
 */

import type {
  SparsePermissions,
  SparseFormGrant,
  ViewLevel,
  EditLevel,
  ArchiveLevel,
  DeleteLevel,
} from '@/lib/rbac';
import { isWildcardPermissions } from '@/lib/rbac';
import { allModules } from '@/consts/modules';
import { allForms } from '@/consts/forms';
import type {
  PermissionModule,
  PermissionSubModule,
  PermissionForm,
  PermissionLevel,
} from '../types';

// ---------------------------------------------------------------------------
// Storage → UI  (expand)
// ---------------------------------------------------------------------------

/**
 * Build the full hierarchical permission tree from a SparsePermissions object.
 * Each module/subModule/form is populated from the static definitions and then
 * overlaid with the grants from `permissions`.
 */
export function expandPermissionsForUI(
  permissions: SparsePermissions,
): PermissionModule[] {
  const isWildcard = isWildcardPermissions(permissions);

  // Index form grants for O(1) lookup
  const grantMap = new Map<string, SparseFormGrant>();
  if (!isWildcard && Array.isArray(permissions.forms)) {
    permissions.forms.forEach((g) => {
      if (typeof g !== 'string') grantMap.set(g.id, g);
    });
  }

  const moduleSet = new Set(
    isWildcard ? [] : Array.isArray(permissions.m) ? permissions.m : [],
  );
  const smSet = new Set(permissions.sm ?? []);

  return allModules.map((mod) => {
    const moduleView = isWildcard || moduleSet.has(mod.key);

    const subModules: PermissionSubModule[] = mod.subModules.map((sm) => {
      const smId = `${mod.key}.${sm.key}`;
      const subModuleView = isWildcard || smSet.has(smId);

      // Find forms belonging to this module + subModule
      const formDefs = allForms.filter(
        (f) => f.module === mod.key && f.subModule === sm.key,
      );

      const forms: PermissionForm[] = formDefs.map((fd) => {
        const formId = `${mod.key}.${sm.key}.${fd.key}`;
        const grant = grantMap.get(formId);

        if (isWildcard) {
          return {
            name: fd.name,
            key: fd.key,
            accessibility: fd.accessibility,
            viewLevel: 'all' as PermissionLevel,
            create: fd.accessibility.includes('create'),
            editLevel: fd.accessibility.includes('edit')
              ? ('all' as PermissionLevel)
              : ('none' as PermissionLevel),
            archiveLevel: fd.accessibility.includes('archive')
              ? ('all' as PermissionLevel)
              : ('none' as PermissionLevel),
            deleteLevel: fd.accessibility.includes('delete')
              ? ('all' as PermissionLevel)
              : ('none' as PermissionLevel),
          };
        }

        if (!grant) {
          return resetForm(fd);
        }

        return applyGrant(fd, grant);
      });

      return { name: sm.name, key: sm.key, view: subModuleView, forms };
    });

    return { name: mod.name, key: mod.key, view: moduleView, subModules };
  });
}

/** Apply a SparseFormGrant to a form definition, producing a PermissionForm. */
function applyGrant(
  fd: { name: string; key: string; accessibility: string[] },
  grant: SparseFormGrant,
): PermissionForm {
  return {
    name: fd.name,
    key: fd.key,
    accessibility: fd.accessibility,
    viewLevel: levelToUI(grant.v),
    create: grant.c,
    editLevel: editLevelToUI(grant.e),
    archiveLevel: archiveLevelToUI(grant.ar),
    deleteLevel: deleteLevelToUI(grant.d),
  };
}

/** Return a form with all permissions cleared. */
function resetForm(fd: {
  name: string;
  key: string;
  accessibility: string[];
}): PermissionForm {
  return {
    name: fd.name,
    key: fd.key,
    accessibility: fd.accessibility,
    viewLevel: 'none',
    create: false,
    editLevel: 'none',
    archiveLevel: 'none',
    deleteLevel: 'none',
  };
}

// ---------------------------------------------------------------------------
// UI → Storage  (compress)
// ---------------------------------------------------------------------------

/**
 * Convert the hierarchical UI permission state back to SparsePermissions
 * for storage.
 */
export function compressPermissionsForStorage(
  modules: PermissionModule[],
): SparsePermissions {
  const forms: SparseFormGrant[] = [];
  const enabledModules = new Set<string>();
  const enabledSubModules = new Set<string>();

  for (const mod of modules) {
    if (!mod.view) continue;
    enabledModules.add(mod.key);

    for (const sm of mod.subModules) {
      if (!sm.view) continue;
      enabledSubModules.add(`${mod.key}.${sm.key}`);

      for (const form of sm.forms) {
        const grant = compressForm(mod.key, sm.key, form);
        if (grant) forms.push(grant);
      }
    }
  }

  return {
    v: 2,
    forms,
    m: Array.from(enabledModules),
    sm: Array.from(enabledSubModules),
  };
}

/** Compress a single PermissionForm to a SparseFormGrant, or null if empty. */
function compressForm(
  moduleKey: string,
  subModuleKey: string,
  form: PermissionForm,
): SparseFormGrant | null {
  const v = uiToViewLevel(form.viewLevel);
  const c = form.create;
  const e = uiToEditLevel(form.editLevel);
  const ar = uiToArchiveLevel(form.archiveLevel);
  const d = uiToDeleteLevel(form.deleteLevel);

  // Skip if the form has no meaningful permissions
  if (v === 'NONE' && !c && e === false && (ar === false || ar === undefined) && (d === false || d === undefined)) {
    return null;
  }

  const grant: SparseFormGrant = {
    id: `${moduleKey}.${subModuleKey}.${form.key}`,
    v,
    c,
    e,
  };

  if (ar !== false && ar !== undefined) {
    grant.ar = ar;
  }

  if (d !== false && d !== undefined) {
    grant.d = d;
  }

  return grant;
}

// ---------------------------------------------------------------------------
// Helpers: build an empty permission tree
// ---------------------------------------------------------------------------

/** Build a blank permission tree with all permissions cleared. */
export function buildEmptyPermissionTree(): PermissionModule[] {
  return allModules.map((mod) => ({
    name: mod.name,
    key: mod.key,
    view: false,
    subModules: mod.subModules.map((sm) => {
      const formDefs = allForms.filter(
        (f) => f.module === mod.key && f.subModule === sm.key,
      );
      return {
        name: sm.name,
        key: sm.key,
        view: false,
        forms: formDefs.map((fd) => resetForm(fd)),
      };
    }),
  }));
}

// ---------------------------------------------------------------------------
// Level converters
// ---------------------------------------------------------------------------

function levelToUI(level: ViewLevel): PermissionLevel {
  switch (level) {
    case 'ALL':
      return 'all';
    case 'OWN':
      return 'own';
    default:
      return 'none';
  }
}

function editLevelToUI(level: EditLevel | undefined): PermissionLevel {
  if (level === 'ALL') return 'all';
  if (level === 'OWN') return 'own';
  return 'none';
}

function archiveLevelToUI(level: ArchiveLevel | undefined): PermissionLevel {
  if (level === 'ALL') return 'all';
  if (level === 'OWN') return 'own';
  return 'none';
}

function deleteLevelToUI(level: DeleteLevel | undefined): PermissionLevel {
  if (level === 'ALL') return 'all';
  if (level === 'OWN') return 'own';
  return 'none';
}

function uiToViewLevel(level: PermissionLevel): ViewLevel {
  switch (level) {
    case 'all':
      return 'ALL';
    case 'own':
      return 'OWN';
    default:
      return 'NONE';
  }
}

function uiToEditLevel(level: PermissionLevel): EditLevel {
  switch (level) {
    case 'all':
      return 'ALL';
    case 'own':
      return 'OWN';
    default:
      return false;
  }
}

function uiToArchiveLevel(level: PermissionLevel): ArchiveLevel {
  switch (level) {
    case 'all':
      return 'ALL';
    case 'own':
      return 'OWN';
    default:
      return false;
  }
}

function uiToDeleteLevel(level: PermissionLevel): DeleteLevel {
  switch (level) {
    case 'all':
      return 'ALL';
    case 'own':
      return 'OWN';
    default:
      return false;
  }
}
