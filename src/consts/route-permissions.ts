import { Permissions } from "./getPermissions";

export type RoutePermissionRule = {
  match: string;
  matchType?: "equals" | "startsWith";
  anyOf?: string[];
  allOf?: string[];
};

export const routePermissions: RoutePermissionRule[] = [
  // Dashboard — accessible to all authenticated users
  { match: "/dashboard", matchType: "startsWith" },

  // Assets
  {
    match: "/assets",
    matchType: "startsWith",
    anyOf: [Permissions.assets.view],
  },

  // Inspections
  {
    match: "/inspections/history",
    matchType: "startsWith",
    anyOf: [Permissions.inspections.inspections.view],
  },
  {
    match: "/inspections/forms",
    matchType: "startsWith",
    anyOf: [Permissions.inspections.forms.view],
  },
  {
    match: "/inspections/defect-settings",
    matchType: "startsWith",
    anyOf: [Permissions.inspections.inspections.view],
  },
  {
    match: "/inspections/exception-report",
    matchType: "startsWith",
    anyOf: [Permissions.inspections.exceptionReport.view],
  },

  // Maintenance
  {
    match: "/maintenance/service-tasks",
    matchType: "startsWith",
    anyOf: [Permissions.maintenance.serviceTasks.view],
  },
  {
    match: "/maintenance/service-programs",
    matchType: "startsWith",
    anyOf: [Permissions.maintenance.servicePrograms.view],
  },
  {
    match: "/maintenance/service-schedule",
    matchType: "startsWith",
    anyOf: [Permissions.maintenance.servicePrograms.view],
  },
  {
    match: "/maintenance/work-orders",
    matchType: "startsWith",
    anyOf: [Permissions.maintenance.workOrders.view],
  },
  {
    match: "/maintenance/defects",
    matchType: "startsWith",
    anyOf: [Permissions.maintenance.defects.view],
  },
  {
    match: "/maintenance/faults",
    matchType: "startsWith",
    anyOf: [Permissions.maintenance.faults.view],
  },
  {
    match: "/maintenance/inventory",
    matchType: "startsWith",
    anyOf: [Permissions.maintenance.inventory.view],
  },

  // Fuel
  {
    match: "/fuel",
    matchType: "startsWith",
    anyOf: [Permissions.fuel.view],
  },

  // People
  {
    match: "/people/teams",
    matchType: "startsWith",
    anyOf: [Permissions.people.teams.view],
  },
  {
    match: "/people/drivers",
    matchType: "startsWith",
    anyOf: [Permissions.people.drivers.view],
  },
];
