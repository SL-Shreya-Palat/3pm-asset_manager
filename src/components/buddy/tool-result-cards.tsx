"use client";

import { formatDate, formatNumber, humanize } from "./format";

/** Tools whose structured results we render as cards (instead of model text). */
const CARD_TOOLS = new Set([
  "list_assets",
  "list_defects",
  "list_faults",
  "list_work_orders",
  "list_inspections",
  "list_service_schedule",
  "list_service_plans",
  "list_compliance_documents",
  "list_drivers",
  "list_parts",
  "list_purchase_orders",
  "list_fuel_transactions",
  "list_teams",
  "list_vendors",
]);

export function isCardTool(type: string): boolean {
  return CARD_TOOLS.has(type.replace(/^tool-/, ""));
}

type Item = Record<string, unknown>;
type Tone = "green" | "amber" | "red" | "neutral";

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

const TONE: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

interface Mapped {
  title: string;
  status?: string;
  tone?: Tone;
  meta: string[];
}

function assetTone(status: unknown): Tone {
  const s = str(status).toLowerCase();
  if (s === "in_service" || s === "active") return "green";
  if (s === "out_of_service") return "red";
  return "neutral";
}

function defectTone(status: unknown, severity: unknown): Tone {
  if (str(severity).toLowerCase() === "critical") return "red";
  const s = str(status).toLowerCase();
  if (s === "corrected" || s === "no_correction_needed") return "green";
  if (s === "in_progress") return "amber";
  return "neutral";
}

function faultTone(status: unknown, severity: unknown): Tone {
  if (str(severity).toLowerCase() === "high") return "red";
  const s = str(status).toLowerCase();
  if (s === "resolved" || s === "wont_fix") return "green";
  if (s === "in_progress") return "amber";
  return "neutral";
}

function documentTone(status: unknown): Tone {
  const s = str(status).toLowerCase();
  if (s === "expired") return "red";
  if (s === "expiring_soon") return "amber";
  if (s === "valid") return "green";
  return "neutral";
}

function purchaseOrderTone(status: unknown): Tone {
  const s = str(status).toLowerCase();
  if (s === "received" || s === "closed") return "green";
  if (s === "rejected") return "red";
  if (s === "draft") return "neutral";
  return "amber";
}

function scheduleTone(status: unknown): Tone {
  const s = str(status).toLowerCase();
  if (s.includes("overdue")) return "red";
  if (s.includes("due")) return "amber";
  return "green";
}

function mapItem(name: string, item: Item): Mapped {
  switch (name) {
    case "list_assets":
      return {
        title: str(item.name) || str(item.assetNumber) || "Asset",
        status: item.status ? humanize(item.status) : undefined,
        tone: assetTone(item.status),
        meta: [
          item.assetNumber ? `No. ${str(item.assetNumber)}` : "",
          [str(item.make), str(item.model)].filter(Boolean).join(" "),
          item.assetType ? `Type · ${str(item.assetType)}` : "",
          Array.isArray(item.teams) && item.teams.length
            ? `Teams · ${(item.teams as unknown[]).map(str).join(", ")}`
            : "",
          item.currentOdometer != null
            ? `Odometer · ${formatNumber(item.currentOdometer)} km`
            : "",
        ].filter(Boolean),
      };
    case "list_defects":
      return {
        title: str(item.defectNumber) || str(item.name) || "Defect",
        status: item.status ? humanize(item.status) : undefined,
        tone: defectTone(item.status, item.severity),
        meta: [
          item.assetName ? `Asset · ${str(item.assetName)}` : "",
          item.severity ? `Severity · ${humanize(item.severity)}` : "",
          item.date ? `Reported · ${formatDate(item.date)}` : "",
          item.workOrderNumber ? `WO · ${str(item.workOrderNumber)}` : "",
        ].filter(Boolean),
      };
    case "list_faults":
      return {
        title: str(item.faultNumber) || str(item.title) || "Fault",
        status: item.status ? humanize(item.status) : undefined,
        tone: faultTone(item.status, item.severity),
        meta: [
          item.title && item.faultNumber ? str(item.title) : "",
          item.assetName ? `Asset · ${str(item.assetName)}` : "",
          item.severity ? `Severity · ${humanize(item.severity)}` : "",
          item.reportedAt ? `Reported · ${formatDate(item.reportedAt)}` : "",
          item.workOrderNumber ? `WO · ${str(item.workOrderNumber)}` : "",
        ].filter(Boolean),
      };
    case "list_work_orders":
      return {
        title: str(item.workOrderNumber) || "Work Order",
        status: item.statusLabel
          ? str(item.statusLabel)
          : item.isCompleted
            ? "Completed"
            : undefined,
        tone: item.isCompleted ? "green" : "amber",
        meta: [
          item.assetName ? `Asset · ${str(item.assetName)}` : "",
          item.assigneeName ? `Assignee · ${str(item.assigneeName)}` : "",
          item.dueDate ? `Due · ${formatDate(item.dueDate)}` : "",
        ].filter(Boolean),
      };
    case "list_inspections":
      return {
        title:
          str(item.inspectionNumber) ||
          str(item.formTitle) ||
          str(item.assetName) ||
          "Inspection",
        status: item.result ? humanize(item.result) : undefined,
        tone: str(item.result).toLowerCase() === "pass" ? "green" : "red",
        meta: [
          item.assetName ? `Asset · ${str(item.assetName)}` : "",
          item.operatorName ? `Operator · ${str(item.operatorName)}` : "",
          item.defectCount != null && Number(item.defectCount) > 0
            ? `Defects · ${formatNumber(item.defectCount)}`
            : "",
          item.submittedAt ? `Submitted · ${formatDate(item.submittedAt)}` : "",
        ].filter(Boolean),
      };
    case "list_service_schedule":
      return {
        title: str(item.assetName) || str(item.assetNumber) || "Asset",
        status: item.status ? humanize(item.status) : undefined,
        tone: scheduleTone(item.status),
        meta: [
          item.programTitle ? `Program · ${str(item.programTitle)}` : "",
          item.intervalType ? `Interval · ${humanize(item.intervalType)}` : "",
          item.nextDueValue != null ? `Next due · ${str(item.nextDueValue)}` : "",
        ].filter(Boolean),
      };
    case "list_service_plans":
      return {
        title: str(item.name) || "Service plan",
        status: item.isActive === false ? "Inactive" : "Active",
        tone: item.isActive === false ? "neutral" : "green",
        meta: [
          Array.isArray(item.schedules) && item.schedules.length
            ? `Schedules · ${(item.schedules as unknown[]).length}`
            : "",
          item.assignedAssets != null
            ? `Assets · ${formatNumber(item.assignedAssets)}`
            : "",
        ].filter(Boolean),
      };
    case "list_compliance_documents":
      return {
        title: str(item.title) || humanize(item.docType) || "Document",
        status: item.status ? humanize(item.status) : undefined,
        tone: documentTone(item.status),
        meta: [
          item.docType ? `Type · ${humanize(item.docType)}` : "",
          item.expiryDate ? `Expires · ${formatDate(item.expiryDate)}` : "",
          item.daysUntilExpiry != null
            ? Number(item.daysUntilExpiry) < 0
              ? `${formatNumber(Math.abs(Number(item.daysUntilExpiry)))} days overdue`
              : `${formatNumber(item.daysUntilExpiry)} days left`
            : "",
        ].filter(Boolean),
      };
    case "list_drivers":
      return {
        title:
          [str(item.firstName), str(item.lastName)].filter(Boolean).join(" ") ||
          "Driver",
        status: item.isActive === false ? "Inactive" : "Active",
        tone: item.isActive === false ? "neutral" : "green",
        meta: [
          str(item.email),
          item.employeeNumber ? `Emp · ${str(item.employeeNumber)}` : "",
          item.jobPosition ? str(item.jobPosition) : "",
        ].filter(Boolean),
      };
    case "list_parts":
      return {
        title: str(item.name) || str(item.partNumber) || "Part",
        meta: [
          item.partNumber ? `No. ${str(item.partNumber)}` : "",
          item.reorderPoint != null ? `Reorder at · ${formatNumber(item.reorderPoint)}` : "",
        ].filter(Boolean),
      };
    case "list_purchase_orders":
      return {
        title: str(item.poNumber) || "Purchase Order",
        status: item.status ? humanize(item.status) : undefined,
        tone: purchaseOrderTone(item.status),
        meta: [
          item.vendorName ? `Vendor · ${str(item.vendorName)}` : "",
          item.total != null ? `Total · ${formatNumber(item.total)}` : "",
          item.createdAt ? `Created · ${formatDate(item.createdAt)}` : "",
        ].filter(Boolean),
      };
    case "list_fuel_transactions":
      return {
        title: item.assetName ? str(item.assetName) : "Fuel entry",
        meta: [
          item.date ? formatDate(item.date) : "",
          item.volume != null ? `Volume · ${formatNumber(item.volume)}` : "",
          item.totalCost != null ? `Cost · ${formatNumber(item.totalCost)}` : "",
          item.driverName ? `Driver · ${str(item.driverName)}` : "",
        ].filter(Boolean),
      };
    case "list_teams":
      return {
        title: str(item.name) || "Team",
        meta: [
          item.assetCount != null ? `Assets · ${formatNumber(item.assetCount)}` : "",
          item.driverCount != null ? `Drivers · ${formatNumber(item.driverCount)}` : "",
        ].filter(Boolean),
      };
    case "list_vendors":
      return {
        title: str(item.name) || "Vendor",
        meta: [str(item.contactName), str(item.email), str(item.phone)].filter(Boolean),
      };
    default:
      return { title: str(item.name) || str(item.id) || "Item", meta: [] };
  }
}

const MAX_CARDS = 8;

export function ToolResultCards({
  type,
  output,
}: {
  type: string;
  output: { items?: unknown[]; total?: number };
}) {
  const name = type.replace(/^tool-/, "");
  const items = Array.isArray(output.items) ? (output.items as Item[]) : [];
  if (items.length === 0) return null;

  const shown = items.slice(0, MAX_CARDS);
  const extra = items.length - shown.length;

  return (
    <div className="flex flex-col gap-1.5">
      {shown.map((it, i) => {
        const m = mapItem(name, it);
        return (
          <div key={i} className="rounded-lg border bg-background px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{m.title}</span>
              {m.status && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE[m.tone ?? "neutral"]}`}
                >
                  {m.status}
                </span>
              )}
            </div>
            {m.meta.map((line, j) => (
              <div key={j} className="mt-0.5 text-xs text-muted-foreground">
                {line}
              </div>
            ))}
          </div>
        );
      })}
      {extra > 0 && (
        <div className="px-1 text-xs text-muted-foreground">
          +{extra} more{output.total ? ` · ${output.total} total` : ""}
        </div>
      )}
    </div>
  );
}
