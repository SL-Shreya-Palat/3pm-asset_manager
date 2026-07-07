/**
 * Buddy AI tools — Compliance documents (rego / WOF / COF / RUC / insurance
 * with expiry). Status is derived from expiryDate, never stored.
 */

import { z } from "zod";
import { listDocuments, listExpiring } from "@/controller/documents";
import { defineTool } from "./registry";

export const listComplianceDocuments = defineTool({
  name: "list_compliance_documents",
  access: "read",
  permission: "assets:view",
  description:
    "Returns compliance documents (rego, WOF, COF, RUC, insurance, licences) with expiry status (valid, expiring_soon, expired, no_expiry). Use expiringOnly for 'what's expiring/expired'. Filter by asset via assetId. Compliance lives on the asset detail Compliance tab.",
  inputSchema: z.object({
    assetId: z.string().optional().describe("Only documents for this asset id"),
    expiringOnly: z
      .boolean()
      .optional()
      .describe("Only expired or expiring-soon documents (most urgent first)"),
    limit: z.number().optional().describe("Max results (default 10, max 25)"),
  }),
  execute: async (input, ctx) => {
    const limit = Math.min(25, Math.max(1, input.limit ?? 10));
    const result = input.expiringOnly
      ? await listExpiring(ctx.tenantId)
      : await listDocuments(ctx.tenantId, {
          ...(input.assetId && { scope: "asset", assetId: input.assetId }),
        });
    const items = input.expiringOnly && input.assetId
      ? result.items.filter((d) => d.assetId === input.assetId)
      : result.items;
    return { total: items.length, items: items.slice(0, limit) };
  },
});
