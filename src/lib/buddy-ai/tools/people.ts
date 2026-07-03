/**
 * Buddy AI tools — People (drivers, teams, vendors)
 */

import { z } from "zod";
import { getAllDrivers } from "@/controller/drivers";
import { getAllTeams } from "@/controller/teams";
import { getAllVendors } from "@/controller/vendors";
import { defineTool } from "./registry";

export const listDrivers = defineTool({
  name: "list_drivers",
  access: "read",
  permission: { module: "drivers", action: "view" },
  description: "Returns drivers (operators). Use for driver queries.",
  inputSchema: z.object({
    search: z.string().optional().describe("Free-text search over driver name"),
    limit: z.number().optional().describe("Max results (default 10, max 25)"),
  }),
  execute: async (input, ctx) => {
    const result = await getAllDrivers(ctx.tenantId, {
      page: 1,
      limit: Math.min(25, Math.max(1, input.limit ?? 10)),
      ...(input.search?.trim() && { search: input.search.trim() }),
    });
    return { total: result.pagination.total, items: result.items };
  },
});

export const listTeams = defineTool({
  name: "list_teams",
  access: "read",
  permission: { module: "teams", action: "view" },
  description:
    "Returns teams (groups of assets and people). Use for team queries or to resolve a team name to its id.",
  inputSchema: z.object({
    search: z.string().optional().describe("Free-text search over team name"),
    limit: z.number().optional().describe("Max results (default 10, max 25)"),
  }),
  execute: async (input, ctx) => {
    const result = await getAllTeams(ctx.tenantId, {
      page: 1,
      limit: Math.min(25, Math.max(1, input.limit ?? 10)),
      ...(input.search?.trim() && { search: input.search.trim() }),
    });
    return { total: result.pagination.total, items: result.items };
  },
});

export const listVendors = defineTool({
  name: "list_vendors",
  access: "read",
  permission: null,
  adminOnly: true, // mirrors the Vendors nav item (admin/owner only)
  description: "Returns vendors (suppliers, service providers). Use for vendor queries.",
  inputSchema: z.object({
    search: z.string().optional().describe("Free-text search over vendor name"),
    limit: z.number().optional().describe("Max results (default 10, max 25)"),
  }),
  execute: async (input, ctx) => {
    const result = await getAllVendors(ctx.tenantId, {
      page: 1,
      limit: Math.min(25, Math.max(1, input.limit ?? 10)),
      ...(input.search?.trim() && { search: input.search.trim() }),
    });
    return { total: result.pagination.total, items: result.items };
  },
});
