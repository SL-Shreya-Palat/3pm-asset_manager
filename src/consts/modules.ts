export type Modules = {
  name: string;
  key: string;
  accessibility: string[];
  subModules: {
    name: string;
    key: string;
    description?: string;
    accessibility: string[];
  }[];
}[];

export const allModules: Modules = [
  // Assets Module
  {
    name: "Assets",
    key: "assets",
    accessibility: ["view"],
    subModules: [
      {
        name: "Assets",
        key: "assets",
        description: "Manage fleet assets including vehicles, trailers, and equipment",
        accessibility: ["view"],
      },
    ],
  },
  // Inspections Module
  {
    name: "Inspections",
    key: "inspections",
    accessibility: ["view"],
    subModules: [
      {
        name: "Inspection History",
        key: "inspectionHistory",
        description: "View past inspection records and results",
        accessibility: ["view"],
      },
      {
        name: "Forms",
        key: "forms",
        description: "Inspection form templates used for conducting inspections",
        accessibility: ["view"],
      },
      {
        name: "Inspection Settings",
        key: "defectSettings",
        description: "Configure defect types and severity levels for inspections",
        accessibility: ["view"],
      },
      {
        name: "Exception Reports",
        key: "exceptionReport",
        description: "View reports on inspection exceptions and overdue items",
        accessibility: ["view"],
      },
    ],
  },
  // Maintenance Module
  {
    name: "Maintenance",
    key: "maintenance",
    accessibility: ["view"],
    subModules: [
      {
        name: "Defects",
        key: "defects",
        description: "Track and manage asset defects reported during inspections",
        accessibility: ["view"],
      },
      {
        name: "Faults",
        key: "faults",
        description: "Record and resolve mechanical faults on assets",
        accessibility: ["view"],
      },
      {
        name: "Service Tasks",
        key: "serviceTasks",
        description: "Define individual maintenance tasks that can be assigned to assets",
        accessibility: ["view"],
      },
      {
        name: "Service Plans",
        key: "servicePlans",
        accessibility: ["view"],
      },
      {
        name: "Asset Service Schedule",
        key: "serviceSchedule",
        description: "View service schedules assigned to assets",
        accessibility: ["view"],
      },
      {
        name: "Work Orders",
        key: "workOrders",
        description: "Manage work orders for maintenance and repair activities",
        accessibility: ["view"],
      },
      {
        name: "Stock",
        key: "inventory",
        description: "Track parts, supplies, and stock levels across locations",
        accessibility: ["view"],
      },
      {
        name: "Purchase Orders",
        key: "purchaseOrders",
        description: "Create and manage purchase orders for parts and supplies",
        accessibility: ["view"],
      },
    ],
  },
  // People Module
  {
    name: "People",
    key: "people",
    accessibility: ["view"],
    subModules: [
      {
        name: "Teams",
        key: "teams",
        description: "Organize users into teams for scoped access and management",
        accessibility: ["view"],
      },
      {
        name: "Drivers",
        key: "drivers",
        description: "Manage driver profiles, licences, and assignments",
        accessibility: ["view"],
      },
    ],
  },
  // Fuel Module
  {
    name: "Fuel",
    key: "fuel",
    accessibility: ["view"],
    subModules: [
      {
        name: "Fuel",
        key: "fuel",
        description: "Record and track fuel transactions and consumption",
        accessibility: ["view"],
      },
    ],
  },
  // Settings Module
  {
    name: "Settings",
    key: "settings",
    accessibility: ["view"],
    subModules: [
      {
        name: "Asset Types",
        key: "assetTypes",
        description: "Define and manage asset type classifications",
        accessibility: ["view"],
      },
      {
        name: "Measurement Units",
        key: "measurementUnits",
        description: "Configure units of measurement for odometer and hour meters",
        accessibility: ["view"],
      },
      {
        name: "Stock Categories",
        key: "partCategories",
        description: "Organize inventory parts into categories",
        accessibility: ["view"],
      },
      {
        name: "Stock Locations",
        key: "partLocations",
        description: "Define storage locations for inventory parts",
        accessibility: ["view"],
      },
      {
        name: "Work Order Statuses",
        key: "workOrderStatuses",
        description: "Customize workflow statuses for work orders",
        accessibility: ["view"],
      },
      {
        name: "Notifications",
        key: "notifications",
        description: "Configure notification routing and preferences",
        accessibility: ["view"],
      },
      {
        name: "Connections",
        key: "connections",
        description: "Manage external command connections",
        accessibility: ["view"],
      },
      {
        name: "Integrations",
        key: "integrations",
        description: "Configure IoT Hub and other integrations",
        accessibility: ["view"],
      },
    ],
  },
];
