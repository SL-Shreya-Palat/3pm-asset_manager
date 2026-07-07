/**
 * Buddy AI tools — Maintenance (snapshot, work orders, defects, faults,
 * service schedule, service plans)
 */

import { z } from "zod";
import { getAllAssets } from "@/controller/assets";
import { getAllDefects, getDefectSummary } from "@/controller/defects";
import { getAllFaults } from "@/controller/faults";
import { getAllWorkOrders } from "@/controller/work-orders";
import { getServiceSchedule } from "@/controller/service-schedule";
import { getAllServicePlans } from "@/controller/service-plans";
import { defineTool } from "./registry";

export const getFleetSnapshot = defineTool({
  name: "get_fleet_snapshot",
  access: "read",
  permission: null, // sections are individually gated by the user's role below
  description:
    "One-call operations snapshot: asset counts (in/out of service), defect counts by status and severity, work order totals. Use FIRST for broad questions like 'how's my fleet?', 'what needs attention?', 'overview', 'dashboard', 'summary'.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const snapshot: Record<string, unknown> = {};

    if (ctx.checker.hasPermission("assets:view")) {
      const [inService, outOfService] = await Promise.all([
        getAllAssets(ctx.tenantId, { limit: 1, status: "in_service" }),
        getAllAssets(ctx.tenantId, { limit: 1, status: "out_of_service" }),
      ]);
      snapshot.assets = {
        inService: inService.pagination.total,
        outOfService: outOfService.pagination.total,
      };
    }

    if (ctx.checker.hasPermission("maintenance:defects:view")) {
      snapshot.defects = await getDefectSummary(ctx.tenantId);
    }

    if (ctx.checker.hasPermission("maintenance:workOrders:view")) {
      const workOrders = await getAllWorkOrders(ctx.tenantId, { limit: 1 });
      snapshot.workOrders = { total: workOrders.pagination.total };
    }

    if (Object.keys(snapshot).length === 0) {
      return { note: "The user has no access to fleet, defect, or work order data." };
    }
    return snapshot;
  },
});

export const listWorkOrders = defineTool({
  name: "list_work_orders",
  access: "read",
  permission: "maintenance:workOrders:view",
  description:
    "Returns work orders (repair/service jobs). Use for work order queries, open jobs, repairs in progress.",
  inputSchema: z.object({
    search: z.string().optional().describe("Free-text search"),
    limit: z.number().optional().describe("Max results (default 10, max 25)"),
  }),
  execute: async (input, ctx) => {
    const result = await getAllWorkOrders(ctx.tenantId, {
      page: 1,
      limit: Math.min(25, Math.max(1, input.limit ?? 10)),
      ...(input.search?.trim() && { search: input.search.trim() }),
    });
    return { total: result.pagination.total, items: result.items };
  },
});

export const listDefects = defineTool({
  name: "list_defects",
  access: "read",
  permission: "maintenance:defects:view",
  description:
    "Returns reported defects (faults/problems on assets). Filter by status (new, in_progress, corrected, no_correction_needed), severity (critical, major, minor), or asset. Use for defect queries and safety checks.",
  inputSchema: z.object({
    search: z.string().optional().describe("Free-text search"),
    status: z.string().optional().describe("new | in_progress | corrected | no_correction_needed"),
    severity: z.string().optional().describe("critical | major | minor"),
    assetId: z.string().optional().describe("Only defects for this asset id"),
    limit: z.number().optional().describe("Max results (default 10, max 25)"),
  }),
  execute: async (input, ctx) => {
    const result = await getAllDefects(ctx.tenantId, {
      page: 1,
      limit: Math.min(25, Math.max(1, input.limit ?? 10)),
      ...(input.search?.trim() && { search: input.search.trim() }),
      ...(input.status && { status: input.status }),
      ...(input.severity && { severity: input.severity }),
      ...(input.assetId && { assetId: input.assetId }),
    });
    return { total: result.pagination.total, items: result.items };
  },
});

export const listFaults = defineTool({
  name: "list_faults",
  access: "read",
  permission: "maintenance:faults:view",
  description:
    "Returns faults — issues reported directly by drivers or staff (outside pre-start inspections). Distinct from defects. Filter by status (open, in_progress, resolved, wont_fix), priority/severity (high, medium, low), or asset.",
  inputSchema: z.object({
    search: z.string().optional().describe("Free-text search over fault number/title"),
    status: z.string().optional().describe("open | in_progress | resolved | wont_fix"),
    priority: z.string().optional().describe("high | medium | low"),
    severity: z.string().optional().describe("high | medium | low"),
    assetId: z.string().optional().describe("Only faults for this asset id"),
    limit: z.number().optional().describe("Max results (default 10, max 25)"),
  }),
  execute: async (input, ctx) => {
    const result = await getAllFaults(ctx.tenantId, {
      page: 1,
      limit: Math.min(25, Math.max(1, input.limit ?? 10)),
      ...(input.search?.trim() && { search: input.search.trim() }),
      ...(input.status && { status: input.status }),
      ...(input.priority && { priority: input.priority }),
      ...(input.severity && { severity: input.severity }),
      ...(input.assetId && { assetId: input.assetId }),
    });
    return { total: result.pagination.total, items: result.items };
  },
});

export const listServicePlans = defineTool({
  name: "list_service_plans",
  access: "read",
  permission: "maintenance:servicePlans:view",
  description:
    "Returns service plans (named sets of recurring schedules, e.g. A/B/C/D services, assigned to assets). Use for 'what service plans exist', 'how many assets are on plan X'. For due/overdue services use list_service_schedule instead.",
  inputSchema: z.object({
    search: z.string().optional().describe("Free-text search over plan name"),
    limit: z.number().optional().describe("Max results (default 10, max 25)"),
  }),
  execute: async (input, ctx) => {
    const result = await getAllServicePlans(ctx.tenantId, {
      page: 1,
      limit: Math.min(25, Math.max(1, input.limit ?? 10)),
      ...(input.search?.trim() && { search: input.search.trim() }),
    });
    return { total: result.pagination.total, items: result.items };
  },
});

export const listServiceSchedule = defineTool({
  name: "list_service_schedule",
  access: "read",
  permission: "maintenance:servicePlans:view",
  description:
    "Returns the per-asset service schedule (upcoming and overdue services from service programs). Use for 'what services are due/overdue', maintenance planning.",
  inputSchema: z.object({
    search: z.string().optional().describe("Filter by asset name/number"),
    limit: z.number().optional().describe("Max results (default 10, max 25)"),
  }),
  execute: async (input, ctx) => {
    const result = await getServiceSchedule(ctx.tenantId, {
      page: 1,
      limit: Math.min(25, Math.max(1, input.limit ?? 10)),
      ...(input.search?.trim() && { search: input.search.trim() }),
    });
    return { total: result.pagination.total, items: result.items };
  },
});
