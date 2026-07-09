/**
 * RBAC core — types and permission checker for the asset manager.
 *
 * Permission format (SparsePermissions v2):
 * - View levels: "ALL" | "OWN" | "NONE"
 * - Edit levels: "ALL" | "OWN" | false
 * - Archive levels: "ALL" | "OWN" | false
 * - Create: boolean
 *
 * Permission strings follow the pattern:
 *   module:view
 *   module:submodule:view
 *   module:submodule:form:action
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViewLevel = "ALL" | "OWN" | "NONE";
export type EditLevel = "ALL" | "OWN" | false;
export type ArchiveLevel = "ALL" | "OWN" | false;
export type DeleteLevel = "ALL" | "OWN" | false;
export type InspectLevel = "ALL" | "OWN" | false;

export type SparseFormGrant = {
  /** Form identifier: "module.submodule.form" */
  id: string;
  /** View level */
  v: ViewLevel;
  /** Create permission */
  c: boolean;
  /** Edit/update level */
  e: EditLevel;
  /** Archive/unarchive level */
  ar?: ArchiveLevel;
  /** Delete (permanent) level */
  d?: DeleteLevel;
  /** Inspect level (asset inspections) */
  ins?: InspectLevel;
};

export type SparsePermissions = {
  /** Format version */
  v: 2;
  /** Form grants, or ["*"] for wildcard (full access) */
  forms: SparseFormGrant[] | ["*"];
  /** Enabled module keys, or ["*"] for wildcard */
  m: string[] | ["*"];
  /** Enabled submodule IDs ("module.submodule") */
  sm: string[];
};

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isSparsePermissions(
  value: unknown,
): value is SparsePermissions {
  return (
    typeof value === "object" &&
    value !== null &&
    "v" in value &&
    (value as SparsePermissions).v === 2
  );
}

export function isWildcardPermissions(
  permissions: SparsePermissions,
): boolean {
  return (
    Array.isArray(permissions.forms) &&
    permissions.forms.length === 1 &&
    permissions.forms[0] === "*"
  );
}

// ---------------------------------------------------------------------------
// Permission Index (O(1) lookups)
// ---------------------------------------------------------------------------

export class SparsePermissionIndex {
  private formIndex = new Map<string, SparseFormGrant>();
  private moduleSet = new Set<string>();
  private subModuleSet = new Set<string>();
  private wildcard = false;

  build(permissions: SparsePermissions): void {
    this.clear();

    if (isWildcardPermissions(permissions)) {
      this.wildcard = true;
      return;
    }

    if (Array.isArray(permissions.forms)) {
      permissions.forms.forEach((grant) => {
        if (typeof grant === "string") return;
        this.formIndex.set(grant.id, grant);
      });
    }

    if (Array.isArray(permissions.m)) {
      permissions.m.forEach((key) => this.moduleSet.add(key));
    }

    if (permissions.sm) {
      permissions.sm.forEach((id) => this.subModuleSet.add(id));
    }
  }

  isWildcard(): boolean {
    return this.wildcard;
  }

  hasModuleView(moduleKey: string): boolean {
    if (this.wildcard) return true;
    return this.moduleSet.has(moduleKey);
  }

  hasSubModuleView(moduleKey: string, subModuleKey: string): boolean {
    if (this.wildcard) return true;
    return this.subModuleSet.has(`${moduleKey}.${subModuleKey}`);
  }

  hasFormPermission(
    formId: string,
    permission: "view" | "create" | "edit" | "archive" | "delete" | "inspect",
  ): boolean | ViewLevel {
    if (this.wildcard) return permission === "view" ? "ALL" : true;

    const grant = this.formIndex.get(formId);
    if (!grant) return permission === "view" ? "NONE" : false;

    switch (permission) {
      case "view":
        return grant.v;
      case "create":
        return grant.c;
      case "edit":
        return grant.e === "ALL" || grant.e === "OWN";
      case "archive":
        return grant.ar === "ALL" || grant.ar === "OWN";
      case "delete":
        return grant.d === "ALL" || grant.d === "OWN";
      case "inspect":
        return grant.ins === "ALL" || grant.ins === "OWN";
      default:
        return false;
    }
  }

  getViewLevel(formId: string): ViewLevel {
    if (this.wildcard) return "ALL";
    return this.formIndex.get(formId)?.v ?? "NONE";
  }

  getEditLevel(formId: string): EditLevel {
    if (this.wildcard) return "ALL";
    return this.formIndex.get(formId)?.e ?? false;
  }

  getArchiveLevel(formId: string): ArchiveLevel {
    if (this.wildcard) return "ALL";
    return this.formIndex.get(formId)?.ar ?? false;
  }

  getDeleteLevel(formId: string): DeleteLevel {
    if (this.wildcard) return "ALL";
    return this.formIndex.get(formId)?.d ?? false;
  }

  getInspectLevel(formId: string): InspectLevel {
    if (this.wildcard) return "ALL";
    return this.formIndex.get(formId)?.ins ?? false;
  }

  getCreatePermission(formId: string): boolean {
    if (this.wildcard) return true;
    return this.formIndex.get(formId)?.c ?? false;
  }

  /**
   * Check if a permission string is granted.
   *
   * Supports:
   * - "module:view"
   * - "module:submodule:view"
   * - "module:submodule:form:action"
   */
  hasPermission(permission: string | undefined | null): boolean {
    if (this.wildcard) return true;
    if (!permission || typeof permission !== "string" || !permission.trim()) {
      return false;
    }

    const parts = permission.split(":");

    // "module:view"
    if (parts.length === 2 && parts[1] === "view") {
      return this.hasModuleView(parts[0]);
    }

    // "module:submodule:view"
    if (parts.length === 3 && parts[2] === "view") {
      return this.hasSubModuleView(parts[0], parts[1]);
    }

    // "module:submodule:form:action"
    if (parts.length === 4) {
      const [mod, sub, form, action] = parts;
      const formId = `${mod}.${sub}.${form}`;
      if (["view", "create", "edit", "archive", "delete", "inspect"].includes(action)) {
        const result = this.hasFormPermission(
          formId,
          action as "view" | "create" | "edit" | "archive" | "delete" | "inspect",
        );
        return action === "view" ? result !== "NONE" : Boolean(result);
      }
    }

    return false;
  }

  getGrantedFormIds(): string[] {
    if (this.wildcard) return ["*"];
    return Array.from(this.formIndex.keys());
  }

  getVisibleModules(): string[] {
    if (this.wildcard) return ["*"];
    return Array.from(this.moduleSet);
  }

  clear(): void {
    this.formIndex.clear();
    this.moduleSet.clear();
    this.subModuleSet.clear();
    this.wildcard = false;
  }
}

// ---------------------------------------------------------------------------
// Permission Checker
// ---------------------------------------------------------------------------

/**
 * High-level permission checker that converts permission strings
 * into index lookups.
 *
 * Supports:
 * - "module:view"
 * - "module:submodule:view"
 * - "module:submodule:form:action"  (view|create|edit|archive)
 */
export class PermissionChecker {
  private index = new SparsePermissionIndex();

  initialize(permissions: SparsePermissions): void {
    this.index.build(permissions);
  }

  /** Check if a permission string is granted. */
  hasPermission(permission: string | undefined | null): boolean {
    if (this.index.isWildcard()) return true;
    if (!permission || typeof permission !== "string" || !permission.trim()) {
      return false;
    }

    const parts = permission.split(":");

    // "module:view"
    if (parts.length === 2 && parts[1] === "view") {
      return this.index.hasModuleView(parts[0]);
    }

    // "module:submodule:view"
    if (parts.length === 3 && parts[2] === "view") {
      return this.index.hasSubModuleView(parts[0], parts[1]);
    }

    // "module:submodule:form:action"
    if (parts.length === 4) {
      const [mod, sub, form, action] = parts;
      const formId = `${mod}.${sub}.${form}`;

      if (["view", "create", "edit", "archive", "delete", "inspect"].includes(action)) {
        const result = this.index.hasFormPermission(
          formId,
          action as "view" | "create" | "edit" | "archive" | "delete" | "inspect",
        );
        return action === "view" ? result !== "NONE" : Boolean(result);
      }
    }

    return false;
  }

  /** Check if any of the given permissions are granted. */
  hasAnyPermission(permissions: string[]): boolean {
    return permissions.some((p) => this.hasPermission(p));
  }

  /** Get the specific level for a permission (ALL/OWN/NONE or boolean). */
  getPermissionLevel(
    permission: string,
  ): ViewLevel | EditLevel | ArchiveLevel | InspectLevel | boolean {
    if (this.index.isWildcard()) return "ALL";

    const parts = permission.split(":");
    if (parts.length !== 4) return this.hasPermission(permission);

    const [mod, sub, form, action] = parts;
    const formId = `${mod}.${sub}.${form}`;

    switch (action) {
      case "view":
        return this.index.getViewLevel(formId);
      case "edit":
        return this.index.getEditLevel(formId);
      case "archive":
        return this.index.getArchiveLevel(formId);
      case "delete":
        return this.index.getDeleteLevel(formId);
      case "inspect":
        return this.index.getInspectLevel(formId);
      case "create":
        return this.index.getCreatePermission(formId);
      default:
        return this.hasPermission(permission);
    }
  }

  getIndex(): SparsePermissionIndex {
    return this.index;
  }

  clear(): void {
    this.index.clear();
  }
}

// ---------------------------------------------------------------------------
// Ownership helper  (matches construction-portal  services/rbac/utils.ts)
// ---------------------------------------------------------------------------

/**
 * Check whether a user may act on a specific record based on the permission
 * level (ALL / OWN / NONE or false).
 *
 * Usage:
 *   const editLevel = permissionIndex.getEditLevel(formId);
 *   const canEdit   = checkRecordOwnership(editLevel, record.createdBy, userId);
 */
export function checkRecordOwnership(
  level: ViewLevel | EditLevel | ArchiveLevel | DeleteLevel | InspectLevel | boolean,
  createdBy: string | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  if (level === "ALL" || level === true) return true;
  if (level === "OWN") return !!createdBy && !!currentUserId && createdBy === currentUserId;
  return false; // "NONE", false, undefined
}
