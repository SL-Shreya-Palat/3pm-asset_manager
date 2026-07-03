/**
 * Buddy AI tools — Maintenance (snapshot, work orders, defects, service schedule)
 */

import { z } from "zod";
import { roleHasPermission } from "@/lib/rbac";
import { getAllAssets } from "@/controller/assets";
import { getAllDefects, getDefectSummary } from "@/controller/defects";
import { getAllWorkOrders } from "@/controller/work-orders";
import { getServiceSchedule } from "@/controller/service-schedule";
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

    if (roleHasPermission(ctx.role, "assets", "view")) {
      const [inService, outOfService] = await Promise.all([
        getAllAssets(ctx.tenantId, { limit: 1, status: "in_service" }),
        getAllAssets(ctx.tenantId, { limit: 1, status: "out_of_service" }),
      ]);
      snapshot.assets = {
        inService: inService.pagination.total,
        outOfService: outOfService.pagination.total,
      };
    }

    if (roleHasPermission(ctx.role, "defects", "view")) {
      snapshot.defects = await getDefectSummary(ctx.tenantId);
    }

    if (roleHasPermission(ctx.role, "work_order", "view")) {
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
  permission: { module: "work_order", action: "view" },
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
  permission: { module: "defects", action: "view" },
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

export const listServiceSchedule = defineTool({
  name: "list_service_schedule",
  access: "read",
  permission: { module: "service_programs", action: "view" },
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
