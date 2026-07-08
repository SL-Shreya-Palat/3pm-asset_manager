export type FormDef = {
  module: string;
  subModule: string;
  key: string;
  name: string;
  accessibility: string[];
};

export const allForms: FormDef[] = [
  // Assets Module
  {
    module: "assets",
    subModule: "assets",
    key: "asset",
    name: "Asset",
    accessibility: ["view", "create", "inspect", "edit", "archive", "delete"],
  },

  // Inspections Module
  {
    module: "inspections",
    subModule: "inspectionHistory",
    key: "inspection",
    name: "Inspection History",
    accessibility: ["view"],
  },
  {
    module: "inspections",
    subModule: "forms",
    key: "form",
    name: "Form",
    accessibility: ["view"],
  },
  {
    module: "inspections",
    subModule: "defectSettings",
    key: "defectSetting",
    name: "Inspection Settings",
    accessibility: ["view"],
  },
  {
    module: "inspections",
    subModule: "exceptionReport",
    key: "exceptionReport",
    name: "Exception Report",
    accessibility: ["view"],
  },

  // Maintenance Module
  {
    module: "maintenance",
    subModule: "defects",
    key: "defect",
    name: "Defect",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },
  {
    module: "maintenance",
    subModule: "faults",
    key: "fault",
    name: "Fault",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },
  {
    module: "maintenance",
    subModule: "serviceTasks",
    key: "serviceTask",
    name: "Service Task",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },
  {
    module: "maintenance",
    subModule: "servicePlans",
    key: "servicePlan",
    name: "Service Plan",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },
  {
    module: "maintenance",
    subModule: "workOrders",
    key: "workOrder",
    name: "Work Order",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },
  {
    module: "maintenance",
    subModule: "serviceSchedule",
    key: "serviceSchedule",
    name: "Asset Service Schedule",
    accessibility: ["view"],
  },
  {
    module: "maintenance",
    subModule: "inventory",
    key: "inventoryItem",
    name: "Stock",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },
  {
    module: "maintenance",
    subModule: "purchaseOrders",
    key: "purchaseOrder",
    name: "Purchase Order",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },

  // People Module
  {
    module: "people",
    subModule: "teams",
    key: "team",
    name: "Team",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },
  {
    module: "people",
    subModule: "drivers",
    key: "driver",
    name: "Driver",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },

  // Fuel Module
  {
    module: "fuel",
    subModule: "fuel",
    key: "fuelEntry",
    name: "Fuel Entry",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },

  // Settings Module
  {
    module: "settings",
    subModule: "assetTypes",
    key: "assetType",
    name: "Asset Type",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },
  {
    module: "settings",
    subModule: "measurementUnits",
    key: "measurementUnit",
    name: "Measurement Unit",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },
  {
    module: "settings",
    subModule: "partCategories",
    key: "partCategory",
    name: "Part Category",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },
  {
    module: "settings",
    subModule: "partLocations",
    key: "partLocation",
    name: "Part Location",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },
  {
    module: "settings",
    subModule: "workOrderStatuses",
    key: "workOrderStatus",
    name: "Work Order Status",
    accessibility: ["view", "create", "edit", "archive", "delete"],
  },
];
