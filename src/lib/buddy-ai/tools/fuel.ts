/**
 * Buddy AI tools — Fuel
 */

import { z } from "zod";
import { getAllFuelTransactions, getFuelAnalytics } from "@/controller/fuel";
import { defineTool } from "./registry";

export const listFuelTransactions = defineTool({
  name: "list_fuel_transactions",
  access: "read",
  permission: { module: "fuel", action: "view" },
  description:
    "Returns fuel transactions (fill-ups). Filter by asset. Use for fuel purchase/usage queries.",
  inputSchema: z.object({
    search: z.string().optional().describe("Free-text search"),
    assetId: z.string().optional().describe("Only transactions for this asset id"),
    limit: z.number().optional().describe("Max results (default 10, max 25)"),
  }),
  execute: async (input, ctx) => {
    const result = await getAllFuelTransactions(ctx.tenantId, {
      page: 1,
      limit: Math.min(25, Math.max(1, input.limit ?? 10)),
      ...(input.search?.trim() && { search: input.search.trim() }),
      ...(input.assetId && { assetId: input.assetId }),
    });
    return { total: result.pagination.total, items: result.items };
  },
});

export const fuelAnalytics = defineTool({
  name: "get_fuel_analytics",
  access: "read",
  permission: { module: "fuel", action: "view" },
  description:
    "Returns aggregated fuel analytics (spend, volume, efficiency) optionally for one asset and/or a date range (ISO dates). Use for fuel cost/trend analysis.",
  inputSchema: z.object({
    assetId: z.string().optional().describe("Limit to this asset id"),
    startDate: z.string().optional().describe("ISO date, e.g. 2026-06-01"),
    endDate: z.string().optional().describe("ISO date, e.g. 2026-06-30"),
  }),
  execute: async (input, ctx) =>
    getFuelAnalytics(ctx.tenantId, {
      ...(input.assetId && { assetId: input.assetId }),
      ...(input.startDate && { startDate: input.startDate }),
      ...(input.endDate && { endDate: input.endDate }),
    }),
});
