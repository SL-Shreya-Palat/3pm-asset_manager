/**
 * Fleet overview — the data-driven top half of the home dashboard. Fetches the
 * consolidated `/api/dashboard/summary` payload and renders the shared KPI
 * ribbon (same compact design as the list pages) plus reusable charts (fleet
 * status, compliance, open faults, fuel trend, work-order completion). All
 * figures come straight from the canonical module summaries.
 */
'use client';

import * as React from 'react';
import axios from 'axios';
import {
  Truck,
  CircleCheck,
  CircleSlash,
  ShieldAlert,
  Wrench,
  AlertTriangle,
  ClipboardList,
} from 'lucide-react';
import { StatRibbon, StatSeg } from '@/components/ui/stat-ribbon';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartCard,
  ChartLegend,
  DonutChart,
  BarChart,
  TrendAreaChart,
  STATUS_COLORS,
  formatCompact,
} from '@/components/ui/charts';

interface DashboardSummary {
  assets: { total: number; inService: number; outOfService: number; nonCompliant: number };
  compliance: { total: number; valid: number; expiringSoon: number; expired: number; untracked: number };
  defects: { total: number; open: number; criticalOpen: number };
  faults: { open: number; openBySeverity: { high: number; medium: number; low: number } };
  workOrders: { open: number; completed: number; total: number };
  fuelTrend: Array<{ year: number; month: number; totalCost: number; totalVolume: number }>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function DashboardOverview() {
  const [data, setData] = React.useState<DashboardSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await axios.get('/api/dashboard/summary', { withCredentials: true });
        if (alive) setData(res.data.data as DashboardSummary);
      } catch {
        if (alive) setError('Unable to load dashboard data.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  // ── KPI ribbon (shared compact design) ──
  const kpis = (
    <StatRibbon>
      <StatSeg tone="primary" icon={Truck} label="Total Assets" value={data?.assets.total} loading={loading} />
      <StatSeg tone="emerald" icon={CircleCheck} label="In Service" value={data?.assets.inService} loading={loading} />
      <StatSeg tone="red" icon={CircleSlash} label="Out of Service" value={data?.assets.outOfService} loading={loading} />
      <StatSeg
        tone="amber"
        icon={ShieldAlert}
        label="Compliance Alerts"
        value={data?.assets.nonCompliant}
        hint="expired / expiring"
        loading={loading}
      />
      <StatSeg tone="blue" icon={Wrench} label="Open Work Orders" value={data?.workOrders.open} loading={loading} />
      <StatSeg tone="violet" icon={AlertTriangle} label="Open Faults" value={data?.faults.open} loading={loading} />
      <StatSeg tone="sky" icon={ClipboardList} label="Open Defects" value={data?.defects.open} loading={loading} />
    </StatRibbon>
  );

  if (loading || !data) {
    return (
      <div className="space-y-4">
        {kpis}
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-sm border bg-card p-5 shadow-sm">
              <Skeleton className="mb-4 h-4 w-32" />
              <Skeleton className="mx-auto h-40 w-40 rounded-full" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-sm border bg-card p-5 shadow-sm lg:col-span-2">
            <Skeleton className="mb-4 h-4 w-40" />
            <Skeleton className="h-52 w-full" />
          </div>
          <div className="rounded-sm border bg-card p-5 shadow-sm">
            <Skeleton className="mb-4 h-4 w-32" />
            <Skeleton className="mx-auto h-40 w-40 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  // ── Derived chart data ──
  const otherAssets = Math.max(
    0,
    data.assets.total - data.assets.inService - data.assets.outOfService,
  );
  const fleetStatus = [
    { label: 'In Service', value: data.assets.inService, color: STATUS_COLORS.good },
    { label: 'Out of Service', value: data.assets.outOfService, color: STATUS_COLORS.critical },
    { label: 'Other', value: otherAssets, color: STATUS_COLORS.neutral },
  ];

  const compliance = [
    { label: 'Valid', value: data.compliance.valid, color: STATUS_COLORS.good },
    { label: 'Expiring soon', value: data.compliance.expiringSoon, color: STATUS_COLORS.warning },
    { label: 'Expired', value: data.compliance.expired, color: STATUS_COLORS.critical },
    { label: 'Untracked', value: data.compliance.untracked, color: STATUS_COLORS.neutral },
  ];

  const faultSeverity = [
    { label: 'High', value: data.faults.openBySeverity.high, color: STATUS_COLORS.critical },
    { label: 'Medium', value: data.faults.openBySeverity.medium, color: STATUS_COLORS.warning },
    { label: 'Low', value: data.faults.openBySeverity.low, color: STATUS_COLORS.good },
  ];

  const workOrders = [
    { label: 'Open', value: data.workOrders.open, color: STATUS_COLORS.warning },
    { label: 'Completed', value: data.workOrders.completed, color: STATUS_COLORS.good },
  ];

  const fuelPoints = data.fuelTrend.map((m) => ({
    label: MONTHS[(m.month - 1) % 12],
    value: m.totalCost,
  }));
  const fuelTotal = data.fuelTrend.reduce((s, m) => s + m.totalCost, 0);
  const fuelVolume = data.fuelTrend.reduce((s, m) => s + m.totalVolume, 0);

  return (
    <div className="space-y-4">
      {kpis}

      {/* Breakdown charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Fleet Status" subtitle="Availability across the fleet">
          <div className="flex items-center gap-4">
            <DonutChart data={fleetStatus} centerLabel="assets" />
            <ChartLegend
              className="flex-1"
              items={fleetStatus.map((s) => ({ label: s.label, color: s.color, value: s.value }))}
            />
          </div>
        </ChartCard>

        <ChartCard title="Compliance" subtitle="Rego / WOF / CoF / RUC status">
          <div className="flex items-center gap-4">
            <DonutChart data={compliance} centerLabel="assets" />
            <ChartLegend
              className="flex-1"
              items={compliance.map((s) => ({ label: s.label, color: s.color, value: s.value }))}
            />
          </div>
        </ChartCard>

        <ChartCard
          title="Open Faults by Severity"
          subtitle={`${data.faults.open} open`}
          action={
            data.faults.open > 0 ? (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" /> Needs attention
              </span>
            ) : undefined
          }
        >
          <BarChart data={faultSeverity} valueFormat={(n) => `${n}`} />
        </ChartCard>
      </div>

      {/* Trend + maintenance */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Fuel Spend"
          subtitle={`Monthly cost · last 6 months · ${formatCompact(fuelVolume)} total volume`}
          action={<span className="text-sm font-semibold text-foreground tabular-nums">{formatCompact(fuelTotal)}</span>}
          className="lg:col-span-2"
        >
          {fuelPoints.length > 0 ? (
            <TrendAreaChart data={fuelPoints} />
          ) : (
            <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
              No fuel transactions recorded yet.
            </div>
          )}
        </ChartCard>

        <ChartCard title="Work Orders" subtitle="Completion status">
          <div className="flex items-center gap-4">
            <DonutChart
              data={workOrders}
              centerValue={
                data.workOrders.total > 0
                  ? `${Math.round((data.workOrders.completed / data.workOrders.total) * 100)}%`
                  : '—'
              }
              centerLabel="done"
            />
            <ChartLegend
              className="flex-1"
              items={workOrders.map((s) => ({ label: s.label, color: s.color, value: s.value }))}
            />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
            <span className="text-muted-foreground">Critical open defects</span>
            <span className="font-medium text-foreground tabular-nums">
              {data.defects.criticalOpen}
              {data.defects.criticalOpen > 0 && <span className="ml-1.5 text-red-600">needs action</span>}
            </span>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
