/**
 * Buddy AI — Tool catalog
 *
 * Every capability the assistant can use, in one list. Exposure is filtered
 * per request by buildToolset (RBAC + adminOnly). Write tools (Phase 4:
 * create_work_order, update_asset_status, ...) also go here with
 * access: "write" — they automatically require in-chat user approval.
 */

import type { BuddyToolDef } from "./registry";
import { featureGuide } from "./get-feature-guide";
import { listAssets, getAsset } from "./assets";
import {
  getFleetSnapshot,
  listWorkOrders,
  listDefects,
  listFaults,
  listServiceSchedule,
  listServicePlans,
} from "./maintenance";
import { listInspections, getExceptionReportSummary } from "./inspections";
import { listParts, listPurchaseOrders } from "./inventory";
import { listFuelTransactions, fuelAnalytics } from "./fuel";
import { listDrivers, listTeams, listVendors } from "./people";
import { listComplianceDocuments } from "./documents";
import {
  updateAssetStatus,
  updateDefectStatus,
  updateFaultStatus,
  recordMeterReading,
  createWorkOrderAction,
} from "./actions";

export const REGISTRY: BuddyToolDef[] = [
  // Navigation / meta
  featureGuide,
  // Fleet
  getFleetSnapshot,
  listAssets,
  getAsset,
  // Maintenance
  listWorkOrders,
  listDefects,
  listFaults,
  listServiceSchedule,
  listServicePlans,
  // Inspections & compliance
  listInspections,
  getExceptionReportSummary,
  listComplianceDocuments,
  // Inventory & fuel
  listParts,
  listPurchaseOrders,
  listFuelTransactions,
  fuelAnalytics,
  // People
  listDrivers,
  listTeams,
  listVendors,
  // Write actions (require in-chat confirmation)
  updateAssetStatus,
  updateDefectStatus,
  updateFaultStatus,
  recordMeterReading,
  createWorkOrderAction,
];

export {
  defineTool,
  buildToolset,
  buildToolApproval,
  canUseTool,
  type BuddyToolDef,
} from "./registry";
