/**
 * Buddy AI tools — Assets
 */

import { z } from "zod";
import { getAllAssets, getAssetById } from "@/controller/assets";
import { defineTool } from "./registry";

/** Lean asset shape for chat — keeps responses fast and focused. */
function leanAsset(a: Record<string, unknown>) {
  return {
    id: a.id,
    name: a.name,
    assetNumber: a.assetNumber,
    assetType: a.assetTypeName ?? undefined,
    status: a.status,
    make: a.make || undefined,
    model: a.model || undefined,
    year: a.year ?? undefined,
    teams: a.teamNames,
    currentOdometer: a.currentOdometer ?? undefined,
    currentEngineHours: a.currentEngineHours ?? undefined,
  };
}

export const listAssets = defineTool({
  name: "list_assets",
  access: "read",
  permission: { module: "assets", action: "view" },
  description:
    "Returns fleet assets (vehicles, plant, equipment, machinery). Use for asset/fleet queries, finding a specific vehicle, out-of-service checks, OR broad fleet overview/analysis. Supports filtering.",
  inputSchema: z.object({
    search: z
      .string()
      .optional()
      .describe("Free-text search over name, asset number, make, model, VIN, license plate"),
    status: z
      .enum(["in_service", "out_of_service"])
      .optional()
      .describe("Filter by asset status"),
    limit: z.number().optional().describe("Max results (default 15, max 50)"),
  }),
  execute: async (input, ctx) => {
    const result = await getAllAssets(ctx.tenantId, {
      page: 1,
      limit: Math.min(50, Math.max(1, input.limit ?? 15)),
      ...(input.search?.trim() && { search: input.search.trim() }),
      ...(input.status && { status: input.status }),
    });
    return {
      total: result.pagination.total,
      items: (result.items as Array<Record<string, unknown>>).map(leanAsset),
    };
  },
});

export const getAsset = defineTool({
  name: "get_asset",
  access: "read",
  permission: { module: "assets", action: "view" },
  description:
    "Returns full detail for a single asset by its id (from list_assets): meters, service info, rego/WOF date, teams, forms. Use when the user asks about one specific asset.",
  inputSchema: z.object({
    assetId: z.string().describe("The asset id (MongoDB ObjectId) from list_assets"),
  }),
  execute: async (input, ctx) => {
    const asset = await getAssetById(ctx.tenantId, input.assetId);
    if (!asset) return { error: "Asset not found" };
    return { asset };
  },
});
