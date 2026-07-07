/**
 * Buddy AI tools — Write actions
 *
 * Each is access: "write" → the UI shows a Confirm/Cancel card before it runs
 * (handled natively by the AI SDK toolApproval flow). Every tool reuses the
 * same permission-checked controller the forms use, and returns
 * { ok: true, summary } or { ok: false, error } for the result chip.
 */

import { z } from "zod";
import { updateAsset } from "@/controller/assets";
import { addMeterReading } from "@/controller/meter-readings";
import { updateDefect } from "@/controller/defects";
import { updateFault } from "@/controller/faults";
import { createWorkOrder } from "@/controller/work-orders";
import { getAllWorkOrderStatuses } from "@/controller/work-order-statuses";
import { defineTool } from "./registry";

/** Normalize a controller `{ data, error }` result into an ok/summary shape. */
function toResult(
  res: { data: unknown; error: unknown },
  summary: string,
): { ok: boolean; summary?: string; error?: string } {
  if (res.error) {
    const msg =
      typeof res.error === "string"
        ? res.error
        : Object.values(res.error as Record<string, string>)[0] ??
          "Action failed";
    return { ok: false, error: msg };
  }
  return { ok: true, summary };
}

export const updateAssetStatus = defineTool({
  name: "update_asset_status",
  access: "write",
  permission: "assets:assets:asset:edit",
  description:
    "Set an asset in service or out of service. Resolve the asset id first via list_assets. Use for 'take X off the road', 'return X to service'.",
  inputSchema: z.object({
    assetId: z.string().describe("Asset id from list_assets"),
    status: z.enum(["in_service", "out_of_service"]),
  }),
  execute: async (input, ctx) => {
    const res = await updateAsset(ctx.tenantId, ctx.userId, input.assetId, {
      status: input.status,
    });
    const label = input.status === "in_service" ? "In Service" : "Out of Service";
    return toResult(res, `Status set to ${label}`);
  },
});

export const updateDefectStatus = defineTool({
  name: "update_defect_status",
  access: "write",
  permission: "maintenance:defects:defect:edit",
  description:
    "Update a defect's status. Resolve the defect id first via list_defects. Statuses: new, in_progress, corrected, no_correction_needed.",
  inputSchema: z.object({
    defectId: z.string().describe("Defect id from list_defects"),
    status: z.enum(["new", "in_progress", "corrected", "no_correction_needed"]),
  }),
  execute: async (input, ctx) => {
    const res = await updateDefect(ctx.tenantId, ctx.userId, input.defectId, {
      status: input.status,
    });
    return toResult(
      res,
      `Defect marked ${input.status.replace(/_/g, " ")}`,
    );
  },
});

export const updateFaultStatus = defineTool({
  name: "update_fault_status",
  access: "write",
  permission: "maintenance:faults:fault:edit",
  description:
    "Update a fault's status. Resolve the fault id first via list_faults. Statuses: open, in_progress, resolved, wont_fix.",
  inputSchema: z.object({
    faultId: z.string().describe("Fault id from list_faults"),
    status: z.enum(["open", "in_progress", "resolved", "wont_fix"]),
  }),
  execute: async (input, ctx) => {
    const res = await updateFault(ctx.tenantId, ctx.userId, input.faultId, {
      status: input.status,
    });
    return toResult(res, `Fault marked ${input.status.replace(/_/g, " ")}`);
  },
});

export const recordMeterReading = defineTool({
  name: "add_meter_reading",
  access: "write",
  permission: "assets:assets:asset:edit",
  description:
    "Record an odometer (km) or engine-hours reading for an asset. Resolve the asset id first via list_assets. Advances the asset's current meter if higher.",
  inputSchema: z.object({
    assetId: z.string().describe("Asset id from list_assets"),
    meterType: z.enum(["odometer", "engine_hours"]),
    value: z.number().describe("The reading value (non-negative)"),
    notes: z.string().optional(),
  }),
  execute: async (input, ctx) => {
    const res = await addMeterReading(ctx.tenantId, ctx.userId, input.assetId, {
      meterType: input.meterType,
      value: input.value,
      ...(input.notes ? { notes: input.notes } : {}),
    });
    const unit = input.meterType === "engine_hours" ? "hrs" : "km";
    return toResult(res, `Logged ${input.value.toLocaleString()} ${unit}`);
  },
});

export const createWorkOrderAction = defineTool({
  name: "create_work_order",
  access: "write",
  permission: "maintenance:workOrders:workOrder:create",
  description:
    "Create a work order for an asset, assigned to a vendor or a named third party. Must be raised from at least one defect (defectIds) OR at least one service task (serviceTaskIds). Resolve asset/defect/vendor ids first via list_assets, list_defects, list_vendors. The initial status is set automatically.",
  inputSchema: z
    .object({
      assetId: z.string().describe("Asset id from list_assets"),
      assigneeType: z.enum(["vendor", "third_party"]),
      vendorId: z
        .string()
        .optional()
        .describe("Vendor id from list_vendors (required when assigneeType is vendor)"),
      thirdPartyName: z.string().optional().describe("Required when assigneeType is third_party"),
      thirdPartyEmail: z.string().optional().describe("Required when assigneeType is third_party"),
      defectIds: z.array(z.string()).optional().describe("Defect ids this WO resolves"),
      serviceTaskIds: z.array(z.string()).optional().describe("Service task ids to perform"),
      description: z.string().optional(),
    })
    .describe("Provide either defectIds or serviceTaskIds."),
  execute: async (input, ctx) => {
    // Auto-resolve the initial status (lowest sequence; list is sorted asc).
    const statuses = (await getAllWorkOrderStatuses(ctx.tenantId)) as unknown as Array<{
      id: string;
    }>;
    const initial = statuses[0];
    if (!initial) {
      return { ok: false, error: "No work order statuses are set up yet." };
    }
    if (!input.defectIds?.length && !input.serviceTaskIds?.length) {
      return {
        ok: false,
        error: "Provide at least one defect or service task for the work order.",
      };
    }

    const source = input.defectIds?.length ? "defect" : "manual";
    const res = await createWorkOrder(ctx.tenantId, ctx.userId, {
      assetId: input.assetId,
      statusId: initial.id,
      assigneeType: input.assigneeType,
      ...(input.assigneeType === "vendor" && { assigneeId: input.vendorId }),
      ...(input.assigneeType === "third_party" && {
        thirdPartyName: input.thirdPartyName,
        thirdPartyEmail: input.thirdPartyEmail,
      }),
      ...(input.defectIds?.length && { defectIds: input.defectIds }),
      ...(input.serviceTaskIds?.length && { serviceTaskIds: input.serviceTaskIds }),
      ...(input.description && { description: input.description }),
      source,
    } as Parameters<typeof createWorkOrder>[2]);

    const woNumber = (res.data as { workOrderNumber?: string } | null)?.workOrderNumber;
    return toResult(res, woNumber ? `Work order ${woNumber} created` : "Work order created");
  },
});
