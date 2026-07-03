/**
 * Buddy AI tools — Inventory (parts)
 */

import { z } from "zod";
import { getAllParts } from "@/controller/parts";
import { defineTool } from "./registry";

export const listParts = defineTool({
  name: "list_parts",
  access: "read",
  permission: { module: "inventory", action: "view" },
  description:
    "Returns inventory parts (spares, consumables) with stock info. Use for parts/stock queries.",
  inputSchema: z.object({
    search: z.string().optional().describe("Free-text search over part name/number"),
    limit: z.number().optional().describe("Max results (default 10, max 25)"),
  }),
  execute: async (input, ctx) => {
    const result = await getAllParts(ctx.tenantId, {
      page: 1,
      limit: Math.min(25, Math.max(1, input.limit ?? 10)),
      ...(input.search?.trim() && { search: input.search.trim() }),
    });
    return { total: result.pagination.total, items: result.items };
  },
});
