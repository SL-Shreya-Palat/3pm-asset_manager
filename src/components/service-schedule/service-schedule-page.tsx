'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { CalendarClock, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { CountBadge } from '@/components/ui/count-badge';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import type { ServiceScheduleRow, ScheduleStatus, Pagination } from './types';

/* ── Status configuration ── */

const STATUS_CONFIG: Record<
  ScheduleStatus,
  { label: string; variant: 'destructive' | 'warning' | 'success'; icon: typeof AlertTriangle }
> = {
  overdue: { label: 'Overdue', variant: 'destructive', icon: AlertTriangle },
  due_soon: { label: 'Due Soon', variant: 'warning', icon: Clock },
  upcoming: { label: 'Upcoming', variant: 'success', icon: CheckCircle2 },
};

const STATUS_TABS: Array<{ key: 'all' | ScheduleStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'due_soon', label: 'Due Soon' },
  { key: 'upcoming', label: 'Upcoming' },
];

/* ── Helpers ── */

function getDueInfoText(row: ServiceScheduleRow) {
  if (row.dueDimensions.length === 0) return '—';

  // Find the most urgent dimension (lowest remaining)
  const mostUrgent = row.dueDimensions.reduce((a, b) => (a.remaining < b.remaining ? a : b));
  const isOverdue = mostUrgent.remaining <= 0;
  const absRemaining = Math.abs(mostUrgent.remaining);

  if (mostUrgent.type === 'calendar') {
    const dateStr = formatDate(mostUrgent.nextDueValue as string);
    return {
      primary: isOverdue
        ? `${absRemaining} days overdue`
        : `${absRemaining} days remaining`,
      secondary: dateStr,
      isOverdue,
    };
  }

  return {
    primary: isOverdue
      ? `${absRemaining.toLocaleString()} ${mostUrgent.unit} overdue`
      : `${absRemaining.toLocaleString()} ${mostUrgent.unit} remaining`,
    secondary: `Next due: ${(mostUrgent.nextDueValue as number).toLocaleString()} ${mostUrgent.unit}`,
    isOverdue,
  };
}

/* ── Component ── */

export function ServiceSchedulePage() {
  const [items, setItems] = useState<ServiceScheduleRow[]>([]);
  const [allItems, setAllItems] = useState<ServiceScheduleRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 25,
    total: 0,
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [activeTab, setActiveTab] = useState<'all' | ScheduleStatus>('all');

  const {
    hiddenColumnKeys,
    setHiddenColumnKeys,
    density,
    setDensity,
  } = useDataTable();

  // ── Fetch schedule ──
  const fetchSchedule = useCallback(
    async (page: number) => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(rowsPerPage));
        if (debouncedSearch) params.set('search', debouncedSearch);

        const res = await axios.get(`/api/service-schedule?${params.toString()}`, {
          withCredentials: true,
        });
        const data = res.data.data;
        const resultItems: ServiceScheduleRow[] = data.items || [];

        setAllItems(resultItems);

        // Apply client-side status tab filter
        const filtered =
          activeTab === 'all'
            ? resultItems
            : resultItems.filter((item) => item.status === activeTab);
        setItems(filtered);
        setPagination(
          data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false },
        );
      } catch {
        setItems([]);
        setAllItems([]);
      } finally {
        setLoading(false);
      }
    },
    [rowsPerPage, debouncedSearch, activeTab],
  );

  useEffect(() => {
    fetchSchedule(1);
  }, [fetchSchedule]);

  // Re-filter when tab changes (without re-fetching)
  useEffect(() => {
    const filtered =
      activeTab === 'all'
        ? allItems
        : allItems.filter((item) => item.status === activeTab);
    setItems(filtered);
  }, [activeTab, allItems]);

  // ── Tab counts ──
  const tabCounts: Record<string, number> = {
    all: allItems.length,
    overdue: allItems.filter((i) => i.status === 'overdue').length,
    due_soon: allItems.filter((i) => i.status === 'due_soon').length,
    upcoming: allItems.filter((i) => i.status === 'upcoming').length,
  };

  // ── Column definitions ──
  const columns: DataTableColumn<ServiceScheduleRow>[] = [
    {
      key: 'asset',
      header: 'Asset',
      label: 'Asset',
      pinned: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarClock className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{row.assetName}</p>
            {row.assetNumber && (
              <p className="text-xs text-muted-foreground truncate">{row.assetNumber}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'program',
      header: 'Service Program',
      label: 'Service Program',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-sm text-foreground truncate">{row.programTitle}</p>
          <p className="text-xs text-muted-foreground">
            {row.intervalType === 'repeat' ? 'Repeat' : 'One Time'}
          </p>
        </div>
      ),
    },
    {
      key: 'serviceTasks',
      header: 'Service Tasks',
      label: 'Service Tasks',
      render: (row) => {
        if (row.serviceTaskTitles.length === 0) return <span className="text-muted-foreground">—</span>;

        const display = row.serviceTaskTitles.slice(0, 2).join(', ');
        const remaining = row.serviceTaskTitles.length - 2;

        if (remaining > 0) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm text-muted-foreground cursor-default">
                  {display}{' '}
                  <span className="text-xs">+{remaining} more</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <ul className="text-xs space-y-0.5">
                  {row.serviceTaskTitles.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          );
        }

        return <span className="text-sm text-muted-foreground">{display}</span>;
      },
    },
    {
      key: 'dueInfo',
      header: 'Due Info',
      label: 'Due Info',
      render: (row) => {
        const info = getDueInfoText(row);
        if (typeof info === 'string') {
          return <span className="text-muted-foreground text-sm">{info}</span>;
        }

        const allDims = row.dueDimensions;
        const content = (
          <div className="text-sm">
            <span
              className={
                info.isOverdue
                  ? 'text-destructive font-medium'
                  : 'text-muted-foreground'
              }
            >
              {info.primary}
            </span>
            <p className="text-xs text-muted-foreground">{info.secondary}</p>
          </div>
        );

        // If multiple dimensions, show a tooltip with all of them
        if (allDims.length > 1) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-default">{content}</div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <ul className="text-xs space-y-1">
                  {allDims.map((dim, i) => {
                    const isOD = dim.remaining <= 0;
                    const abs = Math.abs(dim.remaining);
                    const label =
                      dim.type === 'calendar'
                        ? `${abs} days ${isOD ? 'overdue' : 'remaining'}`
                        : `${abs.toLocaleString()} ${dim.unit} ${isOD ? 'overdue' : 'remaining'}`;
                    return (
                      <li key={i} className={isOD ? 'text-destructive' : ''}>
                        {dim.type === 'mileage'
                          ? 'Odometer (km)'
                          : dim.type === 'engineHours'
                            ? 'Engine Hours'
                            : 'Calendar'}
                        : {label}
                      </li>
                    );
                  })}
                </ul>
              </TooltipContent>
            </Tooltip>
          );
        }

        return content;
      },
    },
    {
      key: 'status',
      header: 'Status',
      label: 'Status',
      render: (row) => {
        const cfg = STATUS_CONFIG[row.status];
        return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
      },
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PageHeader title="Asset Service Schedule" description="View upcoming and overdue service tasks for each asset" count={pagination.total} />

      {/* Status Tabs */}
      <div className="px-6 pb-3">
        <div className="flex items-center gap-1">
          {STATUS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tabCounts[tab.key] || 0;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {tab.key !== 'all' && (
                  <span
                    className={`h-2 w-2 rounded-full ${
                      tab.key === 'overdue'
                        ? 'bg-destructive'
                        : tab.key === 'due_soon'
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    } ${isActive ? 'opacity-80' : ''}`}
                  />
                )}
                {tab.label}
                <CountBadge
                  count={count}
                  variant={isActive ? 'primary' : 'slate'}
                  size="sm"
                  className={isActive ? 'bg-primary-foreground/20 text-primary-foreground' : ''}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar + Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <DataTableToolbar
          columns={columns}
          hiddenColumnKeys={hiddenColumnKeys}
          onHiddenColumnKeysChange={setHiddenColumnKeys}
          density={density}
          onDensityChange={setDensity}
          searchNode={
            <SearchInput value={search} onChange={setSearch} placeholder="Search by asset name, program title..." />
          }
        />
        <DataTable<ServiceScheduleRow>
          columns={columns}
          data={items}
          pagination={pagination}
          loading={loading}
          rowsPerPage={rowsPerPage}
          onPageChange={fetchSchedule}
          onRowsPerPageChange={setRowsPerPage}
          rowKey={(r) => r.id}
          density={density}
          hiddenColumnKeys={hiddenColumnKeys}
          emptyMessage={
            debouncedSearch
              ? 'No scheduled services match your search.'
              : 'No scheduled services found. Create service programs with assigned assets to see the schedule.'
          }
        />
      </div>
    </div>
  );
}
