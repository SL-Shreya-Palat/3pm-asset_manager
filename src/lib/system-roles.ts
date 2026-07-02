/**
 * Canonical system roles seeded for every tenant at org-creation time.
 *
 * Admin / Manager / Driver are always present and `isSystem: true` (locked from
 * edit/delete in the UI). Seeding is idempotent: the role is created once per
 * tenant; on subsequent logins only `isSystem`/`updatedAt` are touched, so a
 * tenant's own permission tweaks (if any) are never clobbered.
 *
 * NOTE: the tenant's `Owner` role is created via the SSO provisioning path
 * (see provisioning.ts) — it is intentionally not part of this set.
 */
import { ObjectId } from 'mongodb';
import { getRolesCollection } from '@/lib/mongodb';
import type { StoredPermissions } from '@/controller/roles/types';

/** Full, unrestricted access. */
const ALL_ACCESS: StoredPermissions = { scope: 'all', teamScoped: false, mobileOnly: false };

interface SystemRoleDef {
  name: string;
  description: string;
  permissions: StoredPermissions;
  isManager?: boolean;
  isMechanic?: boolean;
  isDriver?: boolean;
  isAdmin?: boolean;
}

export const SYSTEM_ROLE_DEFS: SystemRoleDef[] = [
  {
    name: 'Admin',
    description: 'Administrator — full access to all modules.',
    permissions: ALL_ACCESS,
    isAdmin: true,
  },
  {
    name: 'Manager',
    description: 'Manager — oversees inspections, defects, work orders and inventory.',
    permissions: {
      scope: 'modules',
      teamScoped: false,
      mobileOnly: false,
      modules: {
        teams: { view: true, create: true, update: true },
        assets: { view: true, create: true, update: true },
        inspections: { view: true, create: true, update: true, export: true },
        forms: { view: true },
        exception_report: { view: true, export: true },
        defects: { view: true, create: true, update: true },
        service_tasks: { view: true, create: true, update: true },
        service_programs: { view: true, create: true, update: true },
        work_order: { view: true, create: true, update: true },
        inventory: { view: true, create: true, update: true },
        drivers: { view: true, create: true, update: true },
        fuel: { view: true, create: true, update: true, export: true },
      },
    },
    isManager: true,
  },
  {
    name: 'Driver',
    description: 'Driver — mobile inspections and defect reporting.',
    permissions: {
      scope: 'modules',
      teamScoped: false,
      mobileOnly: true,
      modules: {
        assets: { view: true },
        inspections: { view: true, create: true },
        defects: { view: true, create: true },
        fuel: { view: true, create: true },
        drivers: { view: true },
      },
    },
    isDriver: true,
  },
];

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
          // Always sync permissions and flags from canonical definitions so that
          // code-level changes (e.g. adding a new module to Driver) propagate to
          // existing role documents on next login.
          $set: {
            isSystem: true,
            permissions: def.permissions,
            isManager: def.isManager ?? null,
            isTeamManager: null,
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
