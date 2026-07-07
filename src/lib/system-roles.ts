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

/** Build a form grant with view-only access. */
function viewOnlyGrant(formId: string): SparseFormGrant {
  return { id: formId, v: 'ALL', c: false, e: false };
}

/** Build a form grant with view + create (no edit/archive). */
function viewCreateGrant(formId: string): SparseFormGrant {
  return { id: formId, v: 'ALL', c: true, e: false };
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
    description: 'Manager — oversees inspections, defects, work orders and inventory.',
    permissions: {
      v: 2,
      forms: [
        fullGrant('assets.assets.asset'),
        fullGrant('inspections.inspections.inspection'),
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
      ],
      m: ['assets', 'inspections', 'maintenance', 'people', 'fuel'],
      sm: [
        'assets.assets',
        'inspections.inspections',
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
    description: 'Driver — mobile inspections and defect reporting.',
    permissions: {
      v: 2,
      forms: [
        viewOnlyGrant('assets.assets.asset'),
        viewCreateGrant('inspections.inspections.inspection'),
        viewCreateGrant('maintenance.defects.defect'),
        viewCreateGrant('maintenance.faults.fault'),
        viewCreateGrant('fuel.fuel.fuelEntry'),
        viewOnlyGrant('people.drivers.driver'),
      ],
      m: ['assets', 'inspections', 'maintenance', 'people', 'fuel'],
      sm: [
        'assets.assets',
        'inspections.inspections',
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
      'Team Manager — team-scoped access to assets, drivers, inspections, defects, and work orders.',
    permissions: {
      v: 2,
      forms: [
        fullGrant('assets.assets.asset'),
        fullGrant('inspections.inspections.inspection'),
        fullGrant('maintenance.defects.defect'),
        fullGrant('maintenance.workOrders.workOrder'),
        fullGrant('people.drivers.driver'),
      ],
      m: ['assets', 'inspections', 'maintenance', 'people'],
      sm: [
        'assets.assets',
        'inspections.inspections',
        'maintenance.defects',
        'maintenance.workOrders',
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
      'Mechanic — full access to defects, faults, and work orders in the maintenance module.',
    permissions: {
      v: 2,
      forms: [
        fullGrant('maintenance.defects.defect'),
        fullGrant('maintenance.faults.fault'),
        fullGrant('maintenance.workOrders.workOrder'),
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

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

/**
 * Idempotently seed the canonical system roles for a tenant.
 * Safe to call on every provisioning pass — existing roles are not duplicated.
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
            createdBy: userId,
            createdAt: now,
            isActive: true,
          },
          $set: {
            isSystem: def.isSystem,
            type: def.type,
            permissions: def.permissions,
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
        upsert: true,
      },
    };
  });

  await col.bulkWrite(ops);
}
