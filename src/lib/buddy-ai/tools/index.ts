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
  listServiceSchedule,
} from "./maintenance";
import { listInspections } from "./inspections";
import { listParts } from "./inventory";
import { listFuelTransactions, fuelAnalytics } from "./fuel";
import { listDrivers, listTeams, listVendors } from "./people";
import {
  updateAssetStatus,
  updateDefectStatus,
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
  listServiceSchedule,
  listInspections,
  // Inventory & fuel
  listParts,
  listFuelTransactions,
  fuelAnalytics,
  // People
  listDrivers,
  listTeams,
  listVendors,
  // Write actions (require in-chat confirmation)
  updateAssetStatus,
  updateDefectStatus,
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
