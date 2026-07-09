/**
 * Buddy AI tools — Inventory (parts, purchase orders)
 */

import { z } from "zod";
import { getAllParts } from "@/controller/parts";
import { getAllPurchaseOrders } from "@/controller/purchase-orders";
import { defineTool } from "./registry";

export const listParts = defineTool({
  name: "list_parts",
  access: "read",
  permission: "maintenance:inventory:view",
  description:
    "Returns stock items (spares, consumables) with stock info. Use for stock queries.",
  inputSchema: z.object({
    search: z.string().optional().describe("Free-text search over stock name/number"),
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

export const listPurchaseOrders = defineTool({
  name: "list_purchase_orders",
  access: "read",
  permission: "maintenance:purchaseOrders:view",
  description:
    "Returns purchase orders for parts. Filter by status (draft, pending_approval, rejected, approved, purchased, received, received_partial, closed).",
  inputSchema: z.object({
    search: z.string().optional().describe("Free-text search over PO number/vendor/description"),
    status: z.string().optional().describe("draft | pending_approval | rejected | approved | purchased | received | received_partial | closed"),
    limit: z.number().optional().describe("Max results (default 10, max 25)"),
  }),
  execute: async (input, ctx) => {
    const result = await getAllPurchaseOrders(ctx.tenantId, {
      page: 1,
      limit: Math.min(25, Math.max(1, input.limit ?? 10)),
      ...(input.search?.trim() && { search: input.search.trim() }),
      ...(input.status && { status: input.status }),
    });
    return { total: result.pagination.total, items: result.items };
  },
});
