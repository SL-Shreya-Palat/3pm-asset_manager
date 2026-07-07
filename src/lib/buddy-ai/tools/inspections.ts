/**
 * Buddy AI tools — Inspections (history + exception report)
 */

import { z } from "zod";
import { listInspectionSubmissions } from "@/controller/inspection-submissions";
import { getExceptionReport } from "@/controller/exception-report";
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

const MAX_REPORT_ROWS = 25;

export const getExceptionReportSummary = defineTool({
  name: "get_exception_report",
  access: "read",
  permission: "inspections:exceptionReport:view",
  description:
    "Inspection compliance summary over a date range (from the Exception Report calendar): per asset and form, how many days were inspected, had exceptions (failed inspections), or had no submission. Use for 'who missed their pre-starts', 'inspection compliance last week'. Full calendar is at /inspections/exception-report.",
  inputSchema: z.object({
    from: z.string().describe("Range start, yyyy-MM-dd (inclusive)"),
    to: z.string().describe("Range end, yyyy-MM-dd (inclusive)"),
  }),
  execute: async (input, ctx) => {
    const report = await getExceptionReport(ctx.tenantId, {
      from: input.from,
      to: input.to,
    });
    // Count only days up to "today" — future days aren't gaps.
    const countableDays = report.days.filter((d) => d <= report.today);
    const rows = report.assets.flatMap((asset) =>
      asset.forms.map((form) => {
        let inspected = 0;
        let exceptions = 0;
        for (const day of countableDays) {
          const cell = form.cells[day];
          if (!cell) continue;
          if (cell.status === "exception") exceptions += 1;
          else inspected += 1;
        }
        return {
          assetName: asset.assetName,
          assetNumber: asset.assetNumber,
          formTitle: form.formTitle,
          daysInspected: inspected,
          daysWithExceptions: exceptions,
          daysWithoutSubmission: countableDays.length - inspected - exceptions,
        };
      }),
    );
    // Worst compliance first, capped to keep the payload small.
    rows.sort((a, b) => b.daysWithoutSubmission - a.daysWithoutSubmission);
    return {
      from: report.from,
      to: report.to,
      daysInRange: countableDays.length,
      assetCount: report.meta.assetCount,
      formCount: report.meta.formCount,
      truncated: report.meta.truncated || rows.length > MAX_REPORT_ROWS,
      rows: rows.slice(0, MAX_REPORT_ROWS),
    };
  },
});
