export type Modules = {
  name: string;
  key: string;
  accessibility: string[];
  subModules: {
    name: string;
    key: string;
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
        name: "Inspections",
        key: "inspections",
        accessibility: ["view"],
      },
      {
        name: "Forms",
        key: "forms",
        accessibility: ["view"],
      },
      {
        name: "Exception Reports",
        key: "exceptionReport",
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
        accessibility: ["view"],
      },
      {
        name: "Faults",
        key: "faults",
        accessibility: ["view"],
      },
      {
        name: "Service Tasks",
        key: "serviceTasks",
        accessibility: ["view"],
      },
      {
        name: "Service Programs",
        key: "servicePrograms",
        accessibility: ["view"],
      },
      {
        name: "Work Orders",
        key: "workOrders",
        accessibility: ["view"],
      },
      {
        name: "Inventory",
        key: "inventory",
        accessibility: ["view"],
      },
      {
        name: "Purchase Orders",
        key: "purchaseOrders",
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
        accessibility: ["view"],
      },
      {
        name: "Drivers",
        key: "drivers",
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
        accessibility: ["view"],
      },
      {
        name: "Measurement Units",
        key: "measurementUnits",
        accessibility: ["view"],
      },
      {
        name: "Part Categories",
        key: "partCategories",
        accessibility: ["view"],
      },
      {
        name: "Part Locations",
        key: "partLocations",
        accessibility: ["view"],
      },
      {
        name: "Work Order Statuses",
        key: "workOrderStatuses",
        accessibility: ["view"],
      },
    ],
  },
];
