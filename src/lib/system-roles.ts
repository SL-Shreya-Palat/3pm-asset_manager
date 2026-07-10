/**
 * Canonical roles seeded for every tenant at org-creation time.
 *
 * Only **Admin** is a system role (`isSystem: true`, `type: 'system'`) — it
 * cannot be edited or deleted.  Manager / Driver / Team Manager / Mechanic
 * are seeded as custom roles (`isSystem: false`, `type: 'custom'`) so tenants
 * can freely adjust them.
 *
 * Seeding is idempotent: the role is created once per tenant; on subsequent
 * logins only classification flags and `updatedAt` are touched, so a tenant's
 * own permission tweaks (if any) are never clobbered.
 *
 * NOTE: the tenant's `Owner` role is created via the SSO provisioning path
 * (see provisioning.ts) — it is intentionally not part of this set.
 */
import { ObjectId } from 'mongodb';
import { getRolesCollection } from '@/lib/mongodb';
import type { SparsePermissions, SparseFormGrant } from '@/lib/rbac';
import type { RoleType } from '@/controller/roles/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a form grant with full access (ALL view, create, ALL edit, ALL archive). */
function fullGrant(formId: string): SparseFormGrant {
  return { id: formId, v: 'ALL', c: true, e: 'ALL', ar: 'ALL' };
}

/** Build a form grant with full access + inspect (for asset forms). */
function fullGrantWithInspect(formId: string): SparseFormGrant {
  return { id: formId, v: 'ALL', c: true, e: 'ALL', ar: 'ALL', ins: 'ALL' };
}

/** Build a form grant with view-only access. */
function viewOnlyGrant(formId: string): SparseFormGrant {
  return { id: formId, v: 'ALL', c: false, e: false };
}

/** Build a form grant with view-only access + OWN inspect (for drivers). */
function viewOnlyWithOwnInspect(formId: string): SparseFormGrant {
  return { id: formId, v: 'ALL', c: false, e: false, ins: 'OWN' };
}

/** Build a form grant with view + create (no edit/archive). */
function viewCreateGrant(formId: string): SparseFormGrant {
  return { id: formId, v: 'ALL', c: true, e: false };
}

/** Own records only: view OWN + create (for drivers reporting defects/faults). */
function ownCreateGrant(formId: string): SparseFormGrant {
  return { id: formId, v: 'OWN', c: true, e: false };
}

/** Own records only: view OWN + create + edit OWN (for driver fuel entries). */
function ownCreateEditGrant(formId: string): SparseFormGrant {
  return { id: formId, v: 'OWN', c: true, e: 'OWN' };
}

// ---------------------------------------------------------------------------
// System role definitions
// ---------------------------------------------------------------------------

interface SystemRoleDef {
  name: string;
  description: string;
  permissions: SparsePermissions;
  teamScoped: boolean;
  mobileOnly: boolean;
  /** True only for Owner and Admin — locks the role from edit/delete. */
  isSystem: boolean;
  /** 'system' for Owner/Admin, 'custom' for everything else. */
  type: RoleType;
  isManager?: boolean;
  isTeamManager?: boolean;
  isMechanic?: boolean;
  isDriver?: boolean;
  isAdmin?: boolean;
}

export const SYSTEM_ROLE_DEFS: SystemRoleDef[] = [
  // ─── Admin ─────────────────────────────────────────────────────────────
  {
    name: 'Admin',
    description: 'Administrator — full access to all modules.',
    permissions: { v: 2, forms: ['*'], m: ['*'], sm: [] },
    teamScoped: false,
    mobileOnly: false,
    isSystem: true,
    type: 'system',
    isAdmin: true,
  },

  // ─── Manager ───────────────────────────────────────────────────────────
  {
    name: 'Manager',
    description: 'Manager — oversees inspections, defects, work orders, inventory and purchasing.',
    permissions: {
      v: 2,
      forms: [
        fullGrantWithInspect('assets.assets.asset'),
        viewOnlyGrant('inspections.inspectionHistory.inspection'),
        viewOnlyGrant('inspections.forms.form'),
        viewOnlyGrant('inspections.exceptionReport.exceptionReport'),
        fullGrant('maintenance.defects.defect'),
        fullGrant('maintenance.faults.fault'),
        fullGrant('maintenance.serviceTasks.serviceTask'),
        fullGrant('maintenance.servicePlans.servicePlan'),
        viewOnlyGrant('maintenance.serviceSchedule.serviceSchedule'),
        fullGrant('maintenance.workOrders.workOrder'),
        fullGrant('maintenance.inventory.inventoryItem'),
        fullGrant('maintenance.purchaseOrders.purchaseOrder'),
        fullGrant('people.teams.team'),
        fullGrant('people.drivers.driver'),
        fullGrant('fuel.fuel.fuelEntry'),
        fullGrant('vendors.vendors.vendor'),
      ],
      m: ['assets', 'inspections', 'maintenance', 'people', 'fuel', 'vendors'],
      sm: [
        'assets.assets',
        'inspections.inspectionHistory',
        'inspections.forms',
        'inspections.exceptionReport',
        'maintenance.defects',
        'maintenance.faults',
        'maintenance.serviceTasks',
        'maintenance.servicePlans',
        'maintenance.serviceSchedule',
        'maintenance.workOrders',
        'maintenance.inventory',
        'maintenance.purchaseOrders',
        'people.teams',
        'people.drivers',
        'fuel.fuel',
        'vendors.vendors',
      ],
    },
    teamScoped: false,
    mobileOnly: false,
    isSystem: false,
    type: 'custom',
    isManager: true,
  },

  // ─── Driver ────────────────────────────────────────────────────────────
  {
    name: 'Driver',
    description: 'Driver — mobile inspections and defect reporting for their own work.',
    permissions: {
      v: 2,
      forms: [
        // Asset visibility is additionally restricted by per-asset Driver Access
        // grants (driverAccessIds) on the assets list.
        viewOnlyWithOwnInspect('assets.assets.asset'),
        { id: 'inspections.inspectionHistory.inspection', v: 'OWN', c: false, e: false },
        ownCreateGrant('maintenance.defects.defect'),
        ownCreateGrant('maintenance.faults.fault'),
        ownCreateEditGrant('fuel.fuel.fuelEntry'),
        viewOnlyGrant('people.drivers.driver'),
      ],
      m: ['assets', 'inspections', 'maintenance', 'people', 'fuel'],
      sm: [
        'assets.assets',
        'inspections.inspectionHistory',
        'maintenance.defects',
        'maintenance.faults',
        'people.drivers',
        'fuel.fuel',
      ],
    },
    teamScoped: false,
    mobileOnly: true,
    isSystem: false,
    type: 'custom',
    isDriver: true,
  },

  // ─── Team Manager ────────────────────────────────────────────────────
  {
    name: 'Team Manager',
    description:
      'Team Manager — team-scoped access to their teams, assets, drivers, inspections, defects, faults, and work orders.',
    permissions: {
      v: 2,
      forms: [
        fullGrantWithInspect('assets.assets.asset'),
        viewOnlyGrant('inspections.inspectionHistory.inspection'),
        fullGrant('maintenance.defects.defect'),
        fullGrant('maintenance.faults.fault'),
        fullGrant('maintenance.workOrders.workOrder'),
        viewOnlyGrant('people.teams.team'),
        fullGrant('people.drivers.driver'),
      ],
      m: ['assets', 'inspections', 'maintenance', 'people'],
      sm: [
        'assets.assets',
        'inspections.inspectionHistory',
        'maintenance.defects',
        'maintenance.faults',
        'maintenance.workOrders',
        'people.teams',
        'people.drivers',
      ],
    },
    teamScoped: true,
    mobileOnly: false,
    isSystem: false,
    type: 'custom',
    isTeamManager: true,
  },

  // ─── Mechanic ────────────────────────────────────────────────────────
  {
    name: 'Mechanic',
    description:
      'Mechanic — works defects, faults and work orders, with visibility of assets, stock and service tasks.',
    permissions: {
      v: 2,
      forms: [
        viewOnlyGrant('assets.assets.asset'),
        fullGrant('maintenance.defects.defect'),
        fullGrant('maintenance.faults.fault'),
        fullGrant('maintenance.workOrders.workOrder'),
        viewOnlyGrant('maintenance.inventory.inventoryItem'),
        viewOnlyGrant('maintenance.serviceTasks.serviceTask'),
        viewOnlyGrant('maintenance.serviceSchedule.serviceSchedule'),
      ],
      m: ['assets', 'maintenance'],
      sm: [
        'assets.assets',
        'maintenance.defects',
        'maintenance.faults',
        'maintenance.workOrders',
        'maintenance.inventory',
        'maintenance.serviceTasks',
        'maintenance.serviceSchedule',
      ],
    },
    teamScoped: false,
    mobileOnly: false,
    isSystem: false,
    type: 'custom',
    isMechanic: true,
  },
];

// ---------------------------------------------------------------------------
// Legacy seed permissions (pre business-alignment pass) — used to self-heal
// roles that are still on the old defaults. A tenant-customized permission
// set matches neither snapshot and is never touched.
// ---------------------------------------------------------------------------

const LEGACY_SEED_PERMISSIONS: Record<string, SparsePermissions> = {
  manager: {
    v: 2,
    forms: [
      fullGrantWithInspect('assets.assets.asset'),
      viewOnlyGrant('inspections.inspectionHistory.inspection'),
      viewOnlyGrant('inspections.forms.form'),
      viewOnlyGrant('inspections.exceptionReport.exceptionReport'),
      fullGrant('maintenance.defects.defect'),
      fullGrant('maintenance.faults.fault'),
      fullGrant('maintenance.serviceTasks.serviceTask'),
      fullGrant('maintenance.servicePlans.servicePlan'),
      fullGrant('maintenance.workOrders.workOrder'),
      fullGrant('maintenance.inventory.inventoryItem'),
      fullGrant('people.teams.team'),
      fullGrant('people.drivers.driver'),
      fullGrant('fuel.fuel.fuelEntry'),
      fullGrant('vendors.vendors.vendor'),
    ],
    m: ['assets', 'inspections', 'maintenance', 'people', 'fuel', 'vendors'],
    sm: [
      'assets.assets',
      'inspections.inspectionHistory',
      'inspections.forms',
      'inspections.exceptionReport',
      'maintenance.defects',
      'maintenance.faults',
      'maintenance.serviceTasks',
      'maintenance.servicePlans',
      'maintenance.workOrders',
      'maintenance.inventory',
      'people.teams',
      'people.drivers',
      'fuel.fuel',
      'vendors.vendors',
    ],
  },
  driver: {
    v: 2,
    forms: [
      viewOnlyWithOwnInspect('assets.assets.asset'),
      viewOnlyGrant('inspections.inspectionHistory.inspection'),
      viewCreateGrant('maintenance.defects.defect'),
      viewCreateGrant('maintenance.faults.fault'),
      viewCreateGrant('fuel.fuel.fuelEntry'),
      viewOnlyGrant('people.drivers.driver'),
    ],
    m: ['assets', 'inspections', 'maintenance', 'people', 'fuel'],
    sm: [
      'assets.assets',
      'inspections.inspectionHistory',
      'maintenance.defects',
      'maintenance.faults',
      'people.drivers',
      'fuel.fuel',
    ],
  },
  'team manager': {
    v: 2,
    forms: [
      fullGrantWithInspect('assets.assets.asset'),
      viewOnlyGrant('inspections.inspectionHistory.inspection'),
      fullGrant('maintenance.defects.defect'),
      fullGrant('maintenance.workOrders.workOrder'),
      fullGrant('people.drivers.driver'),
    ],
    m: ['assets', 'inspections', 'maintenance', 'people'],
    sm: [
      'assets.assets',
      'inspections.inspectionHistory',
      'maintenance.defects',
      'maintenance.workOrders',
      'people.drivers',
    ],
  },
  mechanic: {
    v: 2,
    forms: [
      fullGrant('maintenance.defects.defect'),
      fullGrant('maintenance.faults.fault'),
      fullGrant('maintenance.workOrders.workOrder'),
    ],
    m: ['maintenance'],
    sm: ['maintenance.defects', 'maintenance.faults', 'maintenance.workOrders'],
  },
};

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

/**
 * Idempotently seed the canonical system roles for a tenant.
 * Safe to call on every provisioning pass — existing roles are not duplicated,
 * and roles still on the legacy defaults are upgraded in place (customized
 * permission sets are left alone).
 */
export async function seedSystemRoles(tenantId: ObjectId, userId: ObjectId): Promise<void> {
  const col = await getRolesCollection();
  const now = new Date();

  const ops = SYSTEM_ROLE_DEFS.map((def) => {
    const nameLower = def.name.toLowerCase();
    return {
      updateOne: {
        filter: { tenantId, nameLower },
        update: {
          $setOnInsert: {
            tenantId,
            name: def.name,
            nameLower,
            description: def.description,
            baseCostPerHour: 0,
            chargeOutRate: 0,
            permissions: def.permissions,
            createdBy: userId,
            createdAt: now,
            isActive: true,
            isSystem: def.isSystem,
            type: def.type,
            teamScoped: def.teamScoped,
            mobileOnly: def.mobileOnly,
            isManager: def.isManager ?? null,
            isTeamManager: def.isTeamManager ?? null,
            isMechanic: def.isMechanic ?? null,
            isDriver: def.isDriver ?? null,
            isAdmin: def.isAdmin ?? null,
          },
          $set: {
            updatedBy: userId,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  await col.bulkWrite(ops);

  // Self-heal: roles still carrying the legacy seed permissions get the new
  // defaults. Compared as canonical JSON — any tenant customization differs
  // from the legacy snapshot and is preserved untouched.
  const defsByName = new Map(SYSTEM_ROLE_DEFS.map((d) => [d.name.toLowerCase(), d]));
  const existing = await col
    .find({ tenantId, nameLower: { $in: Array.from(defsByName.keys()) } })
    .project({ nameLower: 1, permissions: 1 })
    .toArray();

  const heals = existing.filter((role) => {
    const nameLower = role.nameLower as string;
    const legacy = LEGACY_SEED_PERMISSIONS[nameLower];
    const def = defsByName.get(nameLower);
    if (!legacy || !def) return false;
    const current = JSON.stringify(role.permissions);
    return current === JSON.stringify(legacy) && current !== JSON.stringify(def.permissions);
  });

  if (heals.length > 0) {
    await col.bulkWrite(
      heals.map((role) => ({
        updateOne: {
          filter: { _id: role._id },
          update: {
            $set: {
              permissions: defsByName.get(role.nameLower as string)!.permissions,
              description: defsByName.get(role.nameLower as string)!.description,
              updatedBy: userId,
              updatedAt: now,
            },
          },
        },
      })),
    );
  }
}
