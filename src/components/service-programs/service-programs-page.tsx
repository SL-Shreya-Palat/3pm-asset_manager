'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  CalendarClock,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
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

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewProgram, setViewProgram] = useState<ServiceProgramRow | null>(null);

  // Delete dialog
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
  }, [rowsPerPage, debouncedSearch]);

  useEffect(() => {
    fetchTaskMap();
  }, [fetchTaskMap]);

  useEffect(() => {
    fetchPrograms(1);
  }, [fetchPrograms]);

  // ── View dialog ──
  const handleOpenView = (program: ServiceProgramRow) => {
    setViewProgram(program);
    setViewDialogOpen(true);
  };

  // ── Delete dialog ──
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
  const getIntervalSummary = (program: ServiceProgramRow): string => {
    const iv = program.interval;
    if (!iv) return '—';
    if (iv.type === 'repeat') {
      const parts: string[] = [];
      if (iv.mileage?.enabled && iv.mileage.every) parts.push(`${iv.mileage.every} mi`);
      if (iv.engineHours?.enabled && iv.engineHours.every) parts.push(`${iv.engineHours.every} hrs`);
      if (iv.calendar?.enabled && iv.calendar.every) {
        const unit = CALENDAR_UNIT_LABELS[iv.calendar.unit] || iv.calendar.unit;
        parts.push(`${iv.calendar.every} ${unit}${iv.calendar.every !== 1 ? 's' : ''}`);
      }
      return parts.length > 0 ? `Every ${parts.join(' / ')}` : 'Repeat';
    }
    if (iv.type === 'one_time') {
      const parts: string[] = [];
      if (iv.dueMileage?.enabled && iv.dueMileage.value) parts.push(`${iv.dueMileage.mode === 'in' ? 'In' : 'At'} ${iv.dueMileage.value} mi`);
      if (iv.dueEngineHours?.enabled && iv.dueEngineHours.value) parts.push(`${iv.dueEngineHours.mode === 'in' ? 'In' : 'At'} ${iv.dueEngineHours.value} hrs`);
      if (iv.dueOnDate?.enabled && iv.dueOnDate.date) parts.push(`On ${new Date(iv.dueOnDate.date).toLocaleDateString()}`);
      return parts.length > 0 ? parts.join(' / ') : 'One Time';
    }
    return 'Repeat';
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
      render: (program) => (
        <span className="text-muted-foreground">
          {program.serviceTaskIds.length === 0
            ? '—'
            : `${program.serviceTaskIds.length} task${program.serviceTaskIds.length !== 1 ? 's' : ''}`}
        </span>
      ),
    },
    {
      key: 'interval',
      header: 'Interval',
      label: 'Interval',
      render: (program) => (
        <span className="text-muted-foreground text-sm">
          {getIntervalSummary(program)}
        </span>
      ),
    },
    {
      key: 'assets',
      header: 'Assets',
      label: 'Assets',
      render: (program) => (
        <span className="text-muted-foreground">
          {program.assetIds.length === 0
            ? '—'
            : `${program.assetIds.length} asset${program.assetIds.length !== 1 ? 's' : ''}`}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (program) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" className="cursor-pointer" onClick={() => handleOpenView(program)}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="cursor-pointer" onClick={() => router.push(`/maintenance/service-programs/${program.id}/edit`)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="cursor-pointer" onClick={() => handleDuplicate(program)}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="cursor-pointer text-destructive hover:text-destructive" onClick={() => handleOpenDelete(program)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PageHeader title="Service Programs" count={pagination.total}>
        <Button onClick={() => router.push('/maintenance/service-programs/new')}>
          <Plus className="h-4 w-4" />
          Add Program
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="px-6 pb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search service programs..."
        />
      </div>

      {/* Toolbar + Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <DataTableToolbar
          columns={programColumns}
          hiddenColumnKeys={hiddenColumnKeys}
          onHiddenColumnKeysChange={setHiddenColumnKeys}
          density={density}
          onDensityChange={setDensity}
        />
        <DataTable<ServiceProgramRow>
          columns={programColumns}
          data={programs}
          pagination={pagination}
          loading={loading}
          rowsPerPage={rowsPerPage}
          onPageChange={fetchPrograms}
          onRowsPerPageChange={setRowsPerPage}
          onRowClick={handleOpenView}
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

      {/* View Service Program Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewProgram?.title || 'Service Program Details'}</DialogTitle>
            <DialogDescription>Service program overview.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {viewProgram && (
              <ViewServiceProgramContent program={viewProgram} taskMap={taskMap} />
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setViewDialogOpen(false);
                if (viewProgram) router.push(`/maintenance/service-programs/${viewProgram.id}/edit`);
              }}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Service Program Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Service Program</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingProgram?.title}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Read-only view of service program details shown in the view dialog. */
function ViewServiceProgramContent({
  program,
  taskMap,
}: {
  program: ServiceProgramRow;
  taskMap: Record<string, string>;
}) {
  const iv = program.interval;
  const rm = program.reminders;

  return (
    <div className="space-y-6">
      {/* Details */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Details</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <ViewField label="Title" value={program.title} />
        </div>
      </div>

      {/* Service Tasks */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Service Tasks</h3>
        <Separator className="mb-4" />
        {program.serviceTaskIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No service tasks assigned.</p>
        ) : (
          <div className="space-y-2">
            {program.serviceTaskIds.map((taskId) => (
              <div
                key={taskId}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <Badge variant="outline" className="text-xs">Task</Badge>
                <span className="text-sm text-foreground">
                  {taskMap[taskId] || taskId}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interval */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Interval</h3>
        <Separator className="mb-4" />
        {iv ? (
          <div className="rounded-md border border-border p-3 space-y-2">
            <Badge variant="secondary" className="text-xs capitalize">
              {iv.type === 'one_time' ? 'One Time' : 'Repeat'}
            </Badge>
            {iv.type === 'repeat' && (
              <div className="space-y-1">
                {iv.mileage?.enabled && iv.mileage.every > 0 && (
                  <p className="text-sm text-foreground">Every {iv.mileage.every} mi</p>
                )}
                {iv.engineHours?.enabled && iv.engineHours.every > 0 && (
                  <p className="text-sm text-foreground">Every {iv.engineHours.every} hrs</p>
                )}
                {iv.calendar?.enabled && iv.calendar.every > 0 && (
                  <p className="text-sm text-foreground">
                    Every {iv.calendar.every} {iv.calendar.unit}{iv.calendar.every !== 1 ? 's' : ''}
                  </p>
                )}
                {iv.ends && iv.ends.type !== 'never' && (
                  <p className="text-sm text-muted-foreground">
                    {iv.ends.type === 'on' && iv.ends.date
                      ? `Ends on ${new Date(iv.ends.date).toLocaleDateString()}`
                      : iv.ends.type === 'after' && iv.ends.occurrences
                        ? `Ends after ${iv.ends.occurrences} occurrences`
                        : ''}
                  </p>
                )}
              </div>
            )}
            {iv.type === 'one_time' && (
              <div className="space-y-1">
                {iv.dueMileage?.enabled && iv.dueMileage.value > 0 && (
                  <p className="text-sm text-foreground">{iv.dueMileage.mode === 'in' ? 'In' : 'At'} {iv.dueMileage.value} mi</p>
                )}
                {iv.dueEngineHours?.enabled && iv.dueEngineHours.value > 0 && (
                  <p className="text-sm text-foreground">{iv.dueEngineHours.mode === 'in' ? 'In' : 'At'} {iv.dueEngineHours.value} hrs</p>
                )}
                {iv.dueOnDate?.enabled && iv.dueOnDate.date && (
                  <p className="text-sm text-foreground">On {new Date(iv.dueOnDate.date).toLocaleDateString()}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No interval configured.</p>
        )}
      </div>

      {/* Assets */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Assets</h3>
        <Separator className="mb-4" />
        {program.assetIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assets assigned.</p>
        ) : (
          <p className="text-sm text-foreground">
            {program.assetIds.length} asset{program.assetIds.length !== 1 ? 's' : ''} assigned
          </p>
        )}
      </div>

      {/* Reminders */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Reminders</h3>
        <Separator className="mb-4" />
        {rm ? (
          <div className="space-y-2">
            {rm.thresholdMileage?.enabled && rm.thresholdMileage.value > 0 && (
              <ViewField label="Threshold (Mileage)" value={`${rm.thresholdMileage.value} mi before due`} />
            )}
            {rm.thresholdEngineHours?.enabled && rm.thresholdEngineHours.value > 0 && (
              <ViewField label="Threshold (Engine Hours)" value={`${rm.thresholdEngineHours.value} hrs before due`} />
            )}
            {rm.thresholdCalendar?.enabled && rm.thresholdCalendar.value > 0 && (
              <ViewField label="Threshold (Calendar)" value={`${rm.thresholdCalendar.value} ${rm.thresholdCalendar.unit}${rm.thresholdCalendar.value !== 1 ? 's' : ''} before due`} />
            )}
            <ViewField
              label="Auto create work order"
              value={rm.autoCreateWorkOrder ? 'Yes' : 'No'}
            />
            {rm.recipientSelf && (
              <ViewField label="Recipients" value="Myself" />
            )}
            {rm.channels.length > 0 && (
              <ViewField
                label="Channels"
                value={rm.channels.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(', ')}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No reminders configured.</p>
        )}
      </div>
    </div>
  );
}

function ViewField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground mt-0.5">{value || '—'}</p>
    </div>
  );
}
