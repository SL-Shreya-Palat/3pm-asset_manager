import { allModules } from "./modules";
import { allForms } from "./forms";

// ============================================================================
// MODULE PERMISSIONS
// ============================================================================

/**
 * Generate module permission constants from modules.ts
 * Format: module:view, module:submodule:view
 */
function generateModulePermissions() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const permissions: any = {};

  allModules.forEach((module) => {
    const moduleKey = module.key;
    permissions[moduleKey] = {
      view: `${moduleKey}:view`,
    };

    module.subModules.forEach((subModule) => {
      const subModuleKey = subModule.key;
      permissions[moduleKey][subModuleKey] = {
        view: `${moduleKey}:${subModuleKey}:view`,
      };
    });
  });

  return permissions;
}

export const ModulePermissions = generateModulePermissions();

// ============================================================================
// FORM PERMISSIONS (CRUD + Archive)
// ============================================================================

/**
 * Generate form permission constants from forms.ts
 * Format: module:submodule:form:action
 */
function generateFormPermissions() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const permissions: any = {};

  allForms.forEach((form) => {
    const { module, subModule, key: formKey } = form;

    if (!permissions[module]) {
      permissions[module] = {};
    }
    if (!permissions[module][subModule]) {
      permissions[module][subModule] = {};
    }

    const basePath = `${module}:${subModule}:${formKey}`;
    const formId = `${module}.${subModule}.${formKey}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formPermission: any = { id: formId };

    if (form.accessibility.includes("view")) {
      formPermission.view = `${basePath}:view`;
    }
    if (form.accessibility.includes("create")) {
      formPermission.create = `${basePath}:create`;
    }
    if (form.accessibility.includes("edit")) {
      formPermission.edit = `${basePath}:edit`;
    }
    if (form.accessibility.includes("archive")) {
      formPermission.archive = `${basePath}:archive`;
    }

    permissions[module][subModule][formKey] = formPermission;
  });

  return permissions;
}

export const FormPermissions = generateFormPermissions();

// ============================================================================
// CORE PERMISSIONS (Merged tree for component usage)
// ============================================================================

/**
 * Global permissions object used throughout the application.
 * Merges module structure with form permissions.
 */
function generatePermissionsTree() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const permissions: any = {};

  // 1. Initialize with module structure and .view permissions
  allModules.forEach((module) => {
    const mKey = module.key;
    permissions[mKey] = {
      view: ModulePermissions[mKey].view,
    };

    module.subModules.forEach((subModule) => {
      const smKey = subModule.key;
      permissions[mKey][smKey] = {
        view: ModulePermissions[mKey][smKey].view,
      };
    });
  });

  // 2. Merge form permissions into the tree
  allForms.forEach((form) => {
    const { module: mKey, subModule: smKey, key: fKey } = form;

    if (!permissions[mKey]) permissions[mKey] = {};
    if (!permissions[mKey][smKey]) permissions[mKey][smKey] = {};

    const formPerms = FormPermissions[mKey][smKey][fKey];
    permissions[mKey][smKey].form = formPerms;
  });

  return permissions;
}

export const Permissions = generatePermissionsTree();

// ============================================================================
// TYPE HELPERS
// ============================================================================

export type PermissionStringType<T> = T extends string
  ? T
  : T extends object
    ? { [K in keyof T]: PermissionStringType<T[K]> }[keyof T]
    : never;

export type PermissionString = PermissionStringType<typeof Permissions>;
export type ModulePermissionString = PermissionStringType<typeof ModulePermissions>;
export type FormPermissionString = PermissionStringType<typeof FormPermissions>;
