'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Plus,
  Edit,
  Archive,
  ArchiveRestore,
  Trash2,
  Eye,
  CalendarClock,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';
import { CountBadge } from '@/components/ui/count-badge';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { ShowArchivedToggle } from '@/components/ui/show-archived-toggle';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { cn, formatDate } from '@/lib/utils';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import type { ServiceProgramRow, Pagination } from './types';

const CALENDAR_UNIT_LABELS: Record<string, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};

export function ServiceProgramsPage() {
  const router = useRouter();
  const [programs, setPrograms] = useState<ServiceProgramRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Service task lookup map for displaying names
  const [taskMap, setTaskMap] = useState<Record<string, string>>({});

  // Table features
  const {
    hiddenColumnKeys, setHiddenColumnKeys,
    density, setDensity,
  } = useDataTable();

  // Archive state
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingProgram, setArchivingProgram] = useState<ServiceProgramRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProgram, setDeletingProgram] = useState<ServiceProgramRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch task names for lookup
  const fetchTaskMap = useCallback(async () => {
    try {
      const res = await axios.get('/api/service-tasks?limit=100', { withCredentials: true });
      const items = res.data.data?.items || [];
      const map: Record<string, string> = {};
      items.forEach((t: Record<string, unknown>) => {
        map[t.id as string] = t.title as string;
      });
      setTaskMap(map);
    } catch {
      // Silent fail
    }
  }, []);

  // ── Fetch programs ──
  const fetchPrograms = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (showArchived) params.set('showArchived', 'true');

      const res = await axios.get(`/api/service-programs?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setPrograms(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch service programs:', err);
      setPrograms([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage, debouncedSearch, showArchived]);

  useEffect(() => {
    fetchTaskMap();
  }, [fetchTaskMap]);

  useEffect(() => {
    fetchPrograms(1);
  }, [fetchPrograms]);

  // ── Archive handlers ──
  const handleOpenArchive = (program: ServiceProgramRow) => {
    setArchivingProgram(program);
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    if (!archivingProgram) return;
    setArchiving(true);
    try {
      await axios.patch(`/api/service-programs/${archivingProgram.id}/archive`, { archived: !showArchived }, { withCredentials: true });
      setArchiveDialogOpen(false);
      setArchivingProgram(null);
      fetchPrograms(pagination.page);
    } catch (err) {
      console.error('Failed to archive/unarchive service program:', err);
    } finally {
      setArchiving(false);
    }
  };

  // Delete handlers
  const handleOpenDelete = (program: ServiceProgramRow) => {
    setDeletingProgram(program);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingProgram) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/service-programs/${deletingProgram.id}`, { withCredentials: true });
      setDeleteDialogOpen(false);
      setDeletingProgram(null);
      fetchPrograms(pagination.page);
    } catch (err) {
      console.error('Failed to delete service program:', err);
    } finally {
      setDeleting(false);
    }
  };

  // ── Duplicate ──
  const handleDuplicate = async (program: ServiceProgramRow) => {
    try {
      await axios.post(`/api/service-programs/${program.id}?action=duplicate`, {}, { withCredentials: true });
      fetchPrograms(1);
    } catch (err) {
      console.error('Failed to duplicate service program:', err);
    }
  };

  // ── Helpers ──
  const getIntervalParts = (program: ServiceProgramRow): { type: string; parts: string[] } => {
    const iv = program.interval;
    if (!iv) return { type: '', parts: [] };
    if (iv.type === 'repeat') {
      const parts: string[] = [];
      if (iv.mileage?.enabled && iv.mileage.every) parts.push(`Every ${iv.mileage.every} km`);
      if (iv.engineHours?.enabled && iv.engineHours.every) parts.push(`Every ${iv.engineHours.every} hrs`);
      if (iv.calendar?.enabled && iv.calendar.every) {
        const unit = CALENDAR_UNIT_LABELS[iv.calendar.unit] || iv.calendar.unit;
        parts.push(`Every ${iv.calendar.every} ${unit}${iv.calendar.every !== 1 ? 's' : ''}`);
      }
      return { type: 'Repeat', parts };
    }
    if (iv.type === 'one_time') {
      const parts: string[] = [];
      if (iv.dueMileage?.enabled && iv.dueMileage.value) parts.push(`${iv.dueMileage.mode === 'in' ? 'In' : 'At'} ${iv.dueMileage.value} km`);
      if (iv.dueEngineHours?.enabled && iv.dueEngineHours.value) parts.push(`${iv.dueEngineHours.mode === 'in' ? 'In' : 'At'} ${iv.dueEngineHours.value} hrs`);
      if (iv.dueOnDate?.enabled && iv.dueOnDate.date) parts.push(`On ${formatDate(iv.dueOnDate.date)}`);
      return { type: 'One Time', parts };
    }
    return { type: 'Repeat', parts: [] };
  };

  // ── Column definitions ──
  const programColumns: DataTableColumn<ServiceProgramRow>[] = [
    {
      key: 'title',
      header: 'Title',
      label: 'Title',
      pinned: true,
      render: (program) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarClock className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground">{program.title}</span>
        </div>
      ),
    },
    {
      key: 'serviceTasks',
      header: 'Service Tasks',
      label: 'Service Tasks',
      render: (program) =>
        program.serviceTaskIds.length === 0
          ? <span className="text-muted-foreground">—</span>
          : <CountBadge count={program.serviceTaskIds.length} variant="blue" size="sm" />,
    },
    {
      key: 'interval',
      header: 'Interval',
      label: 'Interval',
      render: (program) => {
        const { type, parts } = getIntervalParts(program);
        if (!type) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn(
              'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
              type === 'Repeat'
                ? 'bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400'
                : 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
            )}>
              {type}
            </span>
            {parts.map((part, i) => (
              <span key={i} className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-normal bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                {part}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'assets',
      header: 'Assets',
      label: 'Assets',
      render: (program) =>
        program.assetIds.length === 0
          ? <span className="text-muted-foreground">—</span>
          : <CountBadge count={program.assetIds.length} variant="emerald" size="sm" />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (program) => (
        <RowActions>
          {!showArchived && (
            <>
              <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => router.push(`/maintenance/service-programs/${program.id}`)} />
              <RowActionButton label="Edit" icon={<Edit />} onClick={() => router.push(`/maintenance/service-programs/${program.id}/edit`)} />
              <RowActionButton label="Duplicate" icon={<Copy />} onClick={() => handleDuplicate(program)} />
              <RowActionButton label="Archive" icon={<Archive />} onClick={() => handleOpenArchive(program)} />
            </>
          )}
          {showArchived && (
            <>
              <RowActionButton label="Unarchive" icon={<ArchiveRestore />} onClick={() => handleOpenArchive(program)} />
              <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(program)} />
            </>
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PageHeader title="Service Programs" description="Define recurring maintenance plans and intervals for your fleet" count={pagination.total}>
        <Button onClick={() => router.push('/maintenance/service-programs/new')}>
          <Plus className="h-4 w-4" />
          Add Program
        </Button>
      </PageHeader>

      {/* Toolbar + Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <DataTableToolbar
          columns={programColumns}
          hiddenColumnKeys={hiddenColumnKeys}
          onHiddenColumnKeysChange={setHiddenColumnKeys}
          density={density}
          onDensityChange={setDensity}
          afterControls={
            <ShowArchivedToggle checked={showArchived} onCheckedChange={setShowArchived} />
          }
          searchNode={
            <SearchInput value={search} onChange={setSearch} placeholder="Search service programs..." />
          }
        />
        <DataTable<ServiceProgramRow>
          columns={programColumns}
          data={programs}
          pagination={pagination}
          loading={loading}
          rowsPerPage={rowsPerPage}
          onPageChange={fetchPrograms}
          onRowsPerPageChange={setRowsPerPage}
          onRowClick={showArchived ? undefined : (program) => router.push(`/maintenance/service-programs/${program.id}`)}
          rowKey={(p) => p.id}
          density={density}
          hiddenColumnKeys={hiddenColumnKeys}
          emptyMessage={
            debouncedSearch
              ? 'No service programs match your search.'
              : 'No service programs yet. Click "Add Program" to create one.'
          }
        />
      </div>

      {/* Archive Service Program Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={archivingProgram?.title}
        action={showArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Delete Service Program Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingProgram?.title}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
