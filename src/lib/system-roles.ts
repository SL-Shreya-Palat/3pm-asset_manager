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

/** Build a full-access grant WITHOUT create (view/edit/archive ALL, no create). */
function fullGrantNoCreate(formId: string): SparseFormGrant {
  return { id: formId, v: 'ALL', c: false, e: 'ALL', ar: 'ALL' };
}

/** Build a form grant with view-only access. */
function viewOnlyGrant(formId: string): SparseFormGrant {
  return { id: formId, v: 'ALL', c: false, e: false };
}

/**
 * View + edit, no create/archive. Used for Team Manager on `people.teams.team`:
 * they may edit their own teams' membership/details (the /api/teams/:id/users
 * routes require the `edit` action and are already gated by `inTeamScope`, so
 * this can't reach teams they don't belong to) but cannot spin up new teams or
 * delete existing ones — those stay a company-admin action.
 */
function viewEditGrant(formId: string): SparseFormGrant {
  return { id: formId, v: 'ALL', c: false, e: 'ALL' };
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
        viewEditGrant('people.teams.team'),
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
      'Mechanic — views and works on assigned defects, faults and work orders. Cannot create new records by default (mechanics have no access to the Assets/Drivers a new record requires); an admin can grant create via the Roles UI.',
    permissions: {
      v: 2,
      forms: [
        // View + edit + archive existing records, but no create. Mechanics have
        // no Assets/Drivers access, which a new defect/fault/work order requires.
        // An admin can grant create per-form via the Roles UI to enable it.
        // NOTE: mechanics have no inventory grant, yet they CAN pick stock while
        // editing a work order — the stock picker reads from the work-order-scoped
        // /api/work-orders/stock-options endpoint (gated by the WO edit grant
        // above), so no inventory permission is required.
        fullGrantNoCreate('maintenance.defects.defect'),
        fullGrantNoCreate('maintenance.faults.fault'),
        fullGrantNoCreate('maintenance.workOrders.workOrder'),
      ],
      m: ['maintenance'],
      sm: [
        'maintenance.defects',
        'maintenance.faults',
        'maintenance.workOrders',
      ],
    },
    teamScoped: false,
    mobileOnly: false,
    isSystem: false,
    type: 'custom',
    isMechanic: true,
  },
];

/**
 * Canonical Driver definition — the single source for every place that
 * auto-creates a Driver role (driver invite flow, Command staff import).
 * Keeping one definition guarantees auto-created Driver roles carry the
 * assets `inspect` grant the inspection-launch flow requires.
 */
export const DRIVER_ROLE_DEF: SystemRoleDef = SYSTEM_ROLE_DEFS.find((d) => d.isDriver)!;

// ---------------------------------------------------------------------------
// Legacy seed permissions (pre business-alignment pass) — used to self-heal
// roles that are still on the old defaults. Each role maps to the list of
// known legacy snapshots (seeded + auto-created variants). A tenant-customized
// permission set matches none of them and is never touched.
// ---------------------------------------------------------------------------

/**
 * Shape historically inserted by the auto-create paths (drivers controller and
 * Command staff import) before they were unified onto DRIVER_ROLE_DEF. It has
 * no assets grant at all, so these drivers could never launch an inspection.
 * Property order matters — self-heal compares canonical JSON.
 */
const LEGACY_AUTOCREATED_DRIVER_PERMISSIONS: SparsePermissions = {
  v: 2,
  forms: [
    { id: 'inspections.inspectionHistory.inspection', v: 'ALL', c: false, e: false },
  ],
  m: ['inspections'],
  sm: ['inspections.inspectionHistory'],
};

const LEGACY_SEED_PERMISSIONS: Record<string, SparsePermissions[]> = {
  manager: [{
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
  }],
  driver: [{
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
  }, LEGACY_AUTOCREATED_DRIVER_PERMISSIONS],
  'team manager': [{
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
  }, {
    // Shape shipped between the 2026-07-10 RBAC pass and the teams-edit fix:
    // had faults + view-only teams. Heal it to the current def (teams view+edit)
    // so an existing Team Manager can administer their own team's membership.
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
  }],
  mechanic: [{
    v: 2,
    forms: [
      fullGrant('maintenance.defects.defect'),
      fullGrant('maintenance.faults.fault'),
      fullGrant('maintenance.workOrders.workOrder'),
    ],
    m: ['maintenance'],
    sm: ['maintenance.defects', 'maintenance.faults', 'maintenance.workOrders'],
  }],
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

  // Self-heal: roles still carrying ANY known legacy permission snapshot
  // (old seed defaults or the old auto-created Driver shape) get the new
  // defaults — including classification flags, since the legacy auto-created
  // Driver roles were missing isDriver/teamScoped alignment. Compared as
  // canonical JSON — any tenant customization matches no snapshot and is
  // preserved untouched.
  const defsByName = new Map(SYSTEM_ROLE_DEFS.map((d) => [d.name.toLowerCase(), d]));
  const existing = await col
    .find({ tenantId, nameLower: { $in: Array.from(defsByName.keys()) } })
    .project({ nameLower: 1, permissions: 1 })
    .toArray();

  const heals = existing.filter((role) => {
    const nameLower = role.nameLower as string;
    const legacyList = LEGACY_SEED_PERMISSIONS[nameLower];
    const def = defsByName.get(nameLower);
    if (!legacyList || !def) return false;
    const current = JSON.stringify(role.permissions);
    if (current === JSON.stringify(def.permissions)) return false;
    return legacyList.some((legacy) => current === JSON.stringify(legacy));
  });

  if (heals.length > 0) {
    await col.bulkWrite(
      heals.map((role) => {
        const def = defsByName.get(role.nameLower as string)!;
        return {
          updateOne: {
            filter: { _id: role._id },
            update: {
              $set: {
                permissions: def.permissions,
                description: def.description,
                teamScoped: def.teamScoped,
                mobileOnly: def.mobileOnly,
                isManager: def.isManager ?? null,
                isTeamManager: def.isTeamManager ?? null,
                isMechanic: def.isMechanic ?? null,
                isDriver: def.isDriver ?? null,
                isAdmin: def.isAdmin ?? null,
                updatedBy: userId,
                updatedAt: now,
              },
            },
          },
        };
      }),
    );
  }
}
