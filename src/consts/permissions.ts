import { allModules } from './modules';
import { allForms } from './forms';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

/**
 * Generate the full permissions tree from modules.ts and forms.ts.
 *
 * Usage:
 *   Permissions.assets.assets.form.create   → "assets:assets:asset:create"
 *   Permissions.maintenance.defects.view    → "maintenance:defects:view"
 *   Permissions.inspections.view            → "inspections:view"
 */
function generatePermissions() {
  const permissions: AnyObj = {};

  // 1. Module & submodule view permissions
  for (const mod of allModules) {
    permissions[mod.key] = { view: `${mod.key}:view` };

    for (const sm of mod.subModules) {
      permissions[mod.key][sm.key] = {
        view: `${mod.key}:${sm.key}:view`,
      };
    }
  }

  // 2. Form-level CRUD permissions
  for (const form of allForms) {
    const { module: mKey, subModule: smKey, key: fKey } = form;

    if (!permissions[mKey]) permissions[mKey] = {};
    if (!permissions[mKey][smKey]) permissions[mKey][smKey] = {};

    const basePath = `${mKey}:${smKey}:${fKey}`;
    const formPerms: AnyObj = {
      id: `${mKey}.${smKey}.${fKey}`,
    };

    if (form.accessibility.includes('view')) formPerms.view = `${basePath}:view`;
    if (form.accessibility.includes('create')) formPerms.create = `${basePath}:create`;
    if (form.accessibility.includes('edit')) formPerms.edit = `${basePath}:edit`;
    if (form.accessibility.includes('archive')) formPerms.archive = `${basePath}:archive`;
    if (form.accessibility.includes('delete')) formPerms.delete = `${basePath}:delete`;

    permissions[mKey][smKey].form = formPerms;
  }

  return permissions;
}

export const Permissions = generatePermissions();
