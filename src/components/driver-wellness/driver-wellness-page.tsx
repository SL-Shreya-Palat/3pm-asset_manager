'use client';

/**
 * Driver Wellness page — dashboard view with stat cards, filter tabs,
 * and a paginated data table of wellness checks. Follows the same
 * pattern as inspection-history.tsx.
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  CheckCircle2,
  XCircle,
  Users,
  ClipboardCheck,
  HeartPulse,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { SearchInput } from '@/components/ui/search-input';
import { PageHeader } from '@/components/ui/page-header';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import type { DataTablePagination } from '@/components/ui/data-table.types';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { WellnessCheckRow, WellnessSummary } from './types';

const RESULT_FILTERS = [
  { key: '', label: 'All' },
  { key: 'pass', label: 'Passed' },
  { key: 'fail', label: 'Failed' },
] as const;

function ResultBadge({ result }: { result: string }) {
  return result === 'pass' ? (
    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
      <CheckCircle2 className="h-3 w-3" /> Pass
    </Badge>
  ) : (
    <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
      <XCircle className="h-3 w-3" /> Fail
    </Badge>
  );
}

function BoolBadge({ value, yesLabel = 'Yes', noLabel = 'No' }: { value: boolean; yesLabel?: string; noLabel?: string }) {
  return value ? (
    <span className="text-emerald-600 font-medium">{yesLabel}</span>
  ) : (
    <span className="text-red-600 font-medium">{noLabel}</span>
  );
}

export function DriverWellnessPage() {
  const [rows, setRows] = useState<WellnessCheckRow[]>([]);
  const [pagination, setPagination] = useState<DataTablePagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [summary, setSummary] = useState<WellnessSummary>({
    totalDrivers: 0, checkedToday: 0, passedToday: 0, failedToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [resultFilter, setResultFilter] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { hiddenColumnKeys, setHiddenColumnKeys, density, setDensity } = useDataTable();

  // Fetch summary stats
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await axios.get('/api/driver-wellness?view=summary', { withCredentials: true });
      setSummary(res.data.data);
    } catch {
      // keep defaults
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  // Fetch table rows
  const fetchRows = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(rowsPerPage) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (resultFilter) params.set('result', resultFilter);
      const res = await axios.get(`/api/driver-wellness?${params.toString()}`, {
        withCredentials: true,
      });
      const data = res.data.data;
      setRows(data.items ?? []);
      setPagination(data.pagination ?? { page, limit: rowsPerPage, total: 0, hasMore: false });
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage, debouncedSearch, resultFilter]);

  useEffect(() => {
    const t = setTimeout(() => fetchRows(1), 0);
    return () => clearTimeout(t);
  }, [fetchRows]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const columns: DataTableColumn<WellnessCheckRow>[] = [
    {
      key: 'driverName',
      header: 'Driver',
      pinned: true,
      render: (r) => <span className="font-medium">{r.driverName}</span>,
    },
    {
      key: 'result',
      header: 'Result',
      render: (r) => <ResultBadge result={r.result} />,
    },
    {
      key: 'hoursOfSleep',
      header: 'Hours of Sleep',
      render: (r) => (r.hoursOfSleep != null ? r.hoursOfSleep : '—'),
    },
    {
      key: 'fitToWork',
      header: 'Fit to Work',
      render: (r) => <BoolBadge value={r.fitToWork} />,
    },
    {
      key: 'freeOfFatigue',
      header: 'Rested',
      render: (r) => <BoolBadge value={r.freeOfFatigue} />,
    },
    {
      key: 'freeOfSubstances',
      header: 'Substance Free',
      render: (r) => <BoolBadge value={r.freeOfSubstances} />,
    },
    {
      key: 'comments',
      header: 'Comments',
      render: (r) =>
        r.comments ? (
          <span className="text-muted-foreground truncate max-w-[200px] inline-block">
            {r.comments}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'submittedAt',
      header: 'Date',
      render: (r) => (r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Driver Wellness" count={pagination.total} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 pb-4">
        <StatCard
          label="Total Drivers"
          value={summary.totalDrivers}
          icon={<Users className="h-4 w-4" />}
          loading={summaryLoading}
        />
        <StatCard
          label="Checked Today"
          value={summary.checkedToday}
          icon={<ClipboardCheck className="h-4 w-4" />}
          accent="text-blue-600"
          loading={summaryLoading}
        />
        <StatCard
          label="Passed Today"
          value={summary.passedToday}
          icon={<HeartPulse className="h-4 w-4" />}
          accent="text-emerald-600"
          loading={summaryLoading}
        />
        <StatCard
          label="Failed Today"
          value={summary.failedToday}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent="text-red-600"
          loading={summaryLoading}
        />
      </div>

      {/* Filter tabs */}
      <div className="px-6 pb-4">
        <FilterTabs
          value={resultFilter}
          onChange={setResultFilter}
          tabs={RESULT_FILTERS.map((f) => ({ value: f.key, label: f.label }))}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <DataTableToolbar
          columns={columns}
          hiddenColumnKeys={hiddenColumnKeys}
          onHiddenColumnKeysChange={setHiddenColumnKeys}
          density={density}
          onDensityChange={setDensity}
          searchNode={
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by driver name…"
              className="max-w-sm w-full"
            />
          }
        />
        <DataTable<WellnessCheckRow>
          columns={columns}
          data={rows}
          pagination={pagination}
          loading={loading}
          rowsPerPage={rowsPerPage}
          onPageChange={fetchRows}
          onRowsPerPageChange={setRowsPerPage}
          onRowClick={(r) => setDetailId(r.id)}
          rowKey={(r) => r.id}
          hiddenColumnKeys={hiddenColumnKeys}
          density={density}
          emptyMessage="No wellness checks yet."
        />
      </div>

      <WellnessDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

/** Detail dialog shown on row click. */
function WellnessDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [record, setRecord] = useState<WellnessCheckRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/driver-wellness/${id}`, { withCredentials: true });
        if (active) setRecord(res.data.data);
      } catch {
        if (active) setRecord(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Wellness Check</DialogTitle>
        </DialogHeader>

        {loading || !record ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-base">{record.driverName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {record.submittedAt ? new Date(record.submittedAt).toLocaleString() : ''}
                </p>
              </div>
              <ResultBadge result={record.result} />
            </div>

            <Separator />

            {/* Responses */}
            <div className="space-y-2">
              <DetailRow label="Fit and well to drive?" value={record.fitToWork} />
              <DetailRow label="Free of fatigue / well-rested?" value={record.freeOfFatigue} />
              <DetailRow label="Free of alcohol / drugs / medication?" value={record.freeOfSubstances} />
              <DetailRow label="No injury or condition affecting driving?" value={record.noImpairingCondition} />
            </div>

            {record.hoursOfSleep != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hours of sleep</span>
                <span className="font-medium">{record.hoursOfSleep}</span>
              </div>
            )}

            {record.comments && (
              <div>
                <p className="font-medium mb-1">Comments</p>
                <p className="text-muted-foreground">{record.comments}</p>
              </div>
            )}

            {record.signatureUrl && (
              <div>
                <p className="font-medium mb-1">Signature</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={record.signatureUrl} alt="signature" className="border rounded bg-white h-24" />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      {value ? (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <CheckCircle2 className="h-3 w-3" /> Yes
        </Badge>
      ) : (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
          <XCircle className="h-3 w-3" /> No
        </Badge>
      )}
    </div>
  );
}
