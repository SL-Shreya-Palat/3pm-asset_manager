/**
 * Dashboard controller — one consolidated fleet-overview payload for the home
 * dashboard. Composes the SAME canonical summaries the individual modules use
 * (asset summary, compliance breakdown, defect summary, fuel analytics) plus
 * lightweight fault/work-order aggregations, so every number matches its source
 * view. All counts are tenant-scoped and exclude archived records.
 */
import { ObjectId } from "mongodb";
import { getFaultsCollection, getWorkOrdersCollection } from "@/lib/mongodb";
import { getAssetSummary, getComplianceBreakdown } from "@/controller/assets";
import { getDefectSummary } from "@/controller/defects";
import { getFuelAnalytics } from "@/controller/fuel";

/** Group counts from a Mongo `$group` on a field into a plain record. */
function countsToRecord(
  rows: Array<{ _id: unknown; count: number }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (typeof r._id === "string") out[r._id] = r.count;
  }
  return out;
}

export async function getDashboardSummary(tenantId: string) {
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const base = { tenantId: tenantOid, isArchived: { $ne: true } };

  const faultsCol = await getFaultsCollection();
  const woCol = await getWorkOrdersCollection();

  const [
    assets,
    compliance,
    defects,
    fuel,
    faultsByStatusRows,
    openFaultSeverityRows,
    woOpen,
    woCompleted,
  ] = await Promise.all([
    getAssetSummary(tenantId),
    getComplianceBreakdown(tenantId),
    getDefectSummary(tenantId),
    getFuelAnalytics(tenantId, {}),
    faultsCol
      .aggregate<{ _id: unknown; count: number }>([
        { $match: base },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray(),
    faultsCol
      .aggregate<{ _id: unknown; count: number }>([
        { $match: { ...base, status: { $in: ["open", "in_progress"] } } },
        { $group: { _id: "$severity", count: { $sum: 1 } } },
      ])
      .toArray(),
    woCol.countDocuments({ ...base, isCompleted: { $ne: true } }),
    woCol.countDocuments({ ...base, isCompleted: true }),
  ]);

  const faultsByStatus = countsToRecord(faultsByStatusRows);
  const openFaultSeverity = countsToRecord(openFaultSeverityRows);

  return {
    assets, // { total, inService, outOfService, nonCompliant }
    compliance, // { total, valid, expiringSoon, expired, untracked }
    defects, // { total, open, new, inProgress, corrected, criticalOpen, ... }
    faults: {
      open:
        (faultsByStatus.open ?? 0) + (faultsByStatus.in_progress ?? 0),
      byStatus: {
        open: faultsByStatus.open ?? 0,
        inProgress: faultsByStatus.in_progress ?? 0,
        resolved: faultsByStatus.resolved ?? 0,
        wontFix: faultsByStatus.wont_fix ?? 0,
      },
      openBySeverity: {
        high: openFaultSeverity.high ?? 0,
        medium: openFaultSeverity.medium ?? 0,
        low: openFaultSeverity.low ?? 0,
      },
    },
    workOrders: {
      open: woOpen,
      completed: woCompleted,
      total: woOpen + woCompleted,
    },
    // Last 6 months of fuel spend for the trend chart.
    fuelTrend: (fuel.monthlyTrends ?? []).slice(-6).map((m) => ({
      year: m.year,
      month: m.month,
      totalCost: m.totalCost,
      totalVolume: m.totalVolume,
    })),
  };
}
