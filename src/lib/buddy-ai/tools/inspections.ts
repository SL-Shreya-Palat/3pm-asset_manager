/**
 * Buddy AI tools — Inspections
 */

import { z } from "zod";
import { listInspectionSubmissions } from "@/controller/inspection-submissions";
import { defineTool } from "./registry";

export const listInspections = defineTool({
  name: "list_inspections",
  access: "read",
  permission: { module: "inspections", action: "view" },
  description:
    "Returns submitted pre-start inspections. Filter by result (pass/fail) or asset. Use for inspection history, failed inspections, compliance checks.",
  inputSchema: z.object({
    search: z.string().optional().describe("Free-text search"),
    result: z.string().optional().describe("Filter by result, e.g. pass | fail"),
    assetId: z.string().optional().describe("Only inspections for this asset id"),
    limit: z.number().optional().describe("Max results (default 10, max 25)"),
  }),
  execute: async (input, ctx) => {
    const result = await listInspectionSubmissions(ctx.tenantId, {
      page: 1,
      limit: Math.min(25, Math.max(1, input.limit ?? 10)),
      ...(input.search?.trim() && { search: input.search.trim() }),
      ...(input.result && { result: input.result }),
      ...(input.assetId && { assetId: input.assetId }),
    });
    return { total: result.pagination.total, items: result.items };
  },
});
