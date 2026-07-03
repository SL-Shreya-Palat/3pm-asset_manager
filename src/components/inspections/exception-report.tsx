'use client';

/**
 * Exception Report — the fleet-safety view of everything that failed inspection
 * or is otherwise defective. Unlike Inspection History (a per-submission log),
 * exceptions are grouped into a DASHBOARD OF ASSET TILES: grounded vehicles get
 * their own section up top, each tile showing its live defects so you can triage
 * and raise a work order in place. A safety-status KPI band sits above.
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import {
  AlertTriangle,
  ShieldAlert,
  CircleSlash,
  CheckCircle2,
  Wrench,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { PageHeader } from '@/components/ui/page-header';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useSyncSubmissions } from '@/hooks/use-sync-submissions';
import { WorkOrderForm } from '@/components/work-orders/work-order-form';
import { STATUS_DISPLAY_NAME } from '@/components/defects/types';
import type { DefectRow } from '@/components/defects/types';

interface Summary {
  total: number;
  open: number;
  new: number;
  inProgress: number;
  corrected: number;
  noCorrection: number;
  criticalOpen: number;
  outOfService: number;
}

interface AssetGroup {
  assetId: string | null;
  assetName: string;
  outOfService: boolean;
  total: number;
  openCount: number;
  criticalOpenCount: number;
  exceptions: DefectRow[];
}

// Status tabs tuned for triage: "Open" (new + in-progress) is the default lens.
const STATUS_TABS = [
  { value: 'open', label: 'Open' },
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'corrected', label: 'Corrected' },
  { value: 'all', label: 'All' },
];

const MAX_ROWS = 3; // exceptions shown per tile before "+N more"
const groupKey = (g: AssetGroup) => g.assetId ?? 'unassigned';

export function ExceptionReport() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [groups, setGroups] = useState<AssetGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [activeTab, setActiveTab] = useState('open');
  const [severity, setSeverity] = useState('all');

  // Raise-a-work-order slide-out
  const [wo, setWo] = useState<{ assetId: string; defectIds: string[] } | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await axios.get('/api/defects/summary', { withCredentials: true });
      setSummary(res.data.data);
    } catch {
      setSummary(null);
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('status', activeTab);
      if (severity !== 'all') params.set('severity', severity);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await axios.get(`/api/defects/by-asset?${params.toString()}`, { withCredentials: true });
      setGroups(res.data.data?.groups || []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, severity, debouncedSearch]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // Pull any new inspection submissions so exceptions appear without manual sync.
  useSyncSubmissions(() => { fetchSummary(); fetchGroups(); });

  const openWO = (d: DefectRow) => d.assetId && setWo({ assetId: d.assetId, defectIds: [d.id] });
  const hasFilters = Boolean(debouncedSearch) || activeTab !== 'open' || severity !== 'all';

  const grounded = groups.filter((g) => g.outOfService);
  const rest = groups.filter((g) => !g.outOfService);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Exception Report"
        description="Open defects grouped by asset — grounded vehicles first, so what's unsafe reads at a glance"
      />

      {/* Compact safety-status ribbon (context for the list, not a dashboard) */}
      <div className="px-6 pb-1">
        <div className="flex flex-wrap divide-x rounded-xl border bg-card shadow-sm">
          <StatSeg tone="amber" icon={AlertTriangle} label="Open" value={summary?.open} loading={!summary} />
          <StatSeg tone="red" icon={ShieldAlert} label="Critical open" value={summary?.criticalOpen} loading={!summary} />
          <StatSeg tone="red" icon={CircleSlash} label="Under maintenance" value={summary?.outOfService} loading={!summary} />
          <StatSeg tone="emerald" icon={CheckCircle2} label="Corrected" value={summary?.corrected} loading={!summary} />
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <FilterTabs value={activeTab} onChange={setActiveTab} tabs={STATUS_TABS} />
        <div className="flex flex-wrap items-center gap-3">
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All severities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <SearchInput value={search} onChange={setSearch} placeholder="Search asset, defect, operator..." className="w-[240px]" />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-6 pb-8">
        {loading ? (
          <TileGridSkeleton />
        ) : groups.length === 0 ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          <>
            {grounded.length > 0 && (
              <>
                <SectionLabel label="Under maintenance" count={grounded.length} danger />
                <div className="grid gap-4 sm:grid-cols-2">
                  {grounded.map((g) => <AssetTile key={groupKey(g)} group={g} onCreateWO={openWO} />)}
                </div>
              </>
            )}
            {rest.length > 0 && (
              <>
                <SectionLabel label="Open exceptions by asset" count={rest.length} />
                <div className="grid gap-4 sm:grid-cols-2">
                  {rest.map((g) => <AssetTile key={groupKey(g)} group={g} onCreateWO={openWO} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Work Order slide-out — raise a correction WO for an exception */}
      {wo && <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setWo(null)} />}
      <div
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-[560px] border-l border-border bg-background transition-transform duration-300',
          wo ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {wo && (
          <WorkOrderForm
            mode="create"
            source="defect"
            initialAssetId={wo.assetId}
            initialDefectIds={wo.defectIds}
            lockAsset
            onClose={() => setWo(null)}
            onSaved={() => { setWo(null); fetchSummary(); fetchGroups(); }}
          />
        )}
      </div>
    </div>
  );
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────
type Tone = 'amber' | 'red' | 'emerald';
const TONE: Record<Tone, { value: string; icon: string }> = {
  amber: { value: 'text-amber-600', icon: 'bg-amber-100 text-amber-600' },
  red: { value: 'text-red-600', icon: 'bg-red-100 text-red-600' },
  emerald: { value: 'text-emerald-600', icon: 'bg-emerald-100 text-emerald-600' },
};

function StatSeg({ tone, icon: Icon, label, value, loading }: {
  tone: Tone; icon: LucideIcon; label: string; value?: number; loading?: boolean;
}) {
  const t = TONE[tone];
  return (
    <div className="flex min-w-[140px] flex-1 items-center gap-3 px-4 py-3">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4', t.icon)}>
        <Icon />
      </span>
      <div className="min-w-0">
        {loading ? (
          <Skeleton className="h-5 w-8" />
        ) : (
          <p className={cn('text-xl font-bold leading-none tabular-nums', t.value)}>{value ?? 0}</p>
        )}
        <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ─── Section label ──────────────────────────────────────────────────────────
function SectionLabel({ label, count, danger }: { label: string; count: number; danger?: boolean }) {
  return (
    <div className="mb-3 mt-6 flex items-center gap-3 first:mt-0">
      <h2 className={cn('text-xs font-bold uppercase tracking-wider', danger ? 'text-red-600' : 'text-muted-foreground')}>
        {label}
      </h2>
      <span className="rounded-full border bg-card px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
        {count}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

// ─── Asset tile ─────────────────────────────────────────────────────────────
function AssetTile({ group, onCreateWO }: { group: AssetGroup; onCreateWO: (d: DefectRow) => void }) {
  const grounded = group.outOfService;
  const shown = group.exceptions.slice(0, MAX_ROWS);
  const extra = group.exceptions.length - shown.length;

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md',
        grounded && 'border-red-200 ring-1 ring-red-100',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-foreground">{group.assetName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {group.openCount} open
            {group.criticalOpenCount > 0 && (
              <> · <span className="font-medium text-red-600">{group.criticalOpenCount} critical</span></>
            )}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
            grounded ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
          )}
        >
          {grounded ? 'Under maintenance' : 'Attention'}
        </span>
      </div>

      {/* Exceptions */}
      <div className="divide-y border-t">
        {shown.map((d) => (
          <ExceptionRow key={d.id} defect={d} onCreateWO={() => onCreateWO(d)} />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between border-t px-4 py-2.5">
        <span className="text-xs text-muted-foreground">{extra > 0 ? `+${extra} more` : ''}</span>
        {group.assetId && (
          <Link
            href={`/assets/${group.assetId}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            View asset <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

function ExceptionRow({ defect: d, onCreateWO }: { defect: DefectRow; onCreateWO: () => void }) {
  const isHigh = d.severity === 'high';
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30">
      <span
        className={cn('h-2 w-2 shrink-0 rounded-full', isHigh ? 'bg-red-500' : d.severity === 'medium' ? 'bg-amber-400' : 'bg-slate-400')}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{d.name || 'Exception'}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          <span className="font-mono">{d.defectNumber}</span>
          {d.driverName && <> · {d.driverName}</>}
        </p>
      </div>
      <StatusChip status={d.status} />
      {d.workOrderNumber ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 font-mono text-[11px] font-medium text-muted-foreground">
          <Wrench className="h-3 w-3" /> {d.workOrderNumber}
        </span>
      ) : (
        <button
          type="button"
          onClick={onCreateWO}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Wrench className="h-3.5 w-3.5" /> Raise WO
        </button>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone: Record<string, string> = {
    new: 'bg-amber-100 text-amber-700',
    in_progress: 'bg-indigo-100 text-indigo-700',
    corrected: 'bg-emerald-100 text-emerald-700',
    no_correction_needed: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={cn('hidden shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold sm:inline-block', tone[status] || 'bg-muted text-muted-foreground')}>
      {STATUS_DISPLAY_NAME[status] || status}
    </span>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────
function TileGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <CheckCircle2 className="h-7 w-7" />
      </span>
      <p className="mt-4 text-base font-semibold text-foreground">
        {hasFilters ? 'No exceptions match your filters' : 'No open exceptions'}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasFilters ? 'Try clearing filters or switching tabs.' : 'Every asset is clear — nothing needs attention.'}
      </p>
    </div>
  );
}
