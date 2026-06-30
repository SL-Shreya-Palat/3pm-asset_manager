'use client';

import { useEffect, useState, useCallback } from 'react';
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
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import type { DataTableFilterDef } from '@/components/ui/data-table.types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import { ServiceProgramForm } from './service-program-form';
import type { ServiceProgramRow, Pagination } from './types';

const CATEGORY_LABELS: Record<string, string> = {
  scheduled_maintenance: 'Scheduled',
  unscheduled_maintenance: 'Unscheduled',
  inspections: 'Inspections',
  custom: 'Custom',
};

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  time: 'Time',
  distance: 'Distance',
  engine_hours: 'Engine Hours',
};

const CATEGORY_FILTER: DataTableFilterDef[] = [
  {
    columnKey: 'category',
    label: 'Category',
    type: 'select',
    options: [
      { label: 'Scheduled', value: 'scheduled_maintenance' },
      { label: 'Unscheduled', value: 'unscheduled_maintenance' },
      { label: 'Inspections', value: 'inspections' },
      { label: 'Custom', value: 'custom' },
    ],
  },
];

export function ServiceProgramsPage() {
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
    filters, setFilter, clearFilters,
  } = useDataTable();

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create');
  const [editingProgram, setEditingProgram] = useState<ServiceProgramRow | null>(null);

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

      const categoryFilter = filters.category;
      if (categoryFilter && Array.isArray(categoryFilter) && categoryFilter.length === 1) {
        params.set('category', categoryFilter[0]);
      }

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
  }, [rowsPerPage, debouncedSearch, filters.category]);

  useEffect(() => {
    fetchTaskMap();
  }, [fetchTaskMap]);

  useEffect(() => {
    fetchPrograms(1);
  }, [fetchPrograms]);

  // ── Panel handlers ──
  const handleOpenCreate = () => {
    setEditingProgram(null);
    setPanelMode('create');
    setPanelOpen(true);
  };

  const handleOpenEdit = (program: ServiceProgramRow) => {
    setEditingProgram(program);
    setPanelMode('edit');
    setPanelOpen(true);
  };

  const handleClosePanel = () => {
    setPanelOpen(false);
    setEditingProgram(null);
  };

  const handleSaved = () => {
    handleClosePanel();
    fetchPrograms(panelMode === 'create' ? 1 : pagination.page);
    fetchTaskMap(); // Refresh in case new tasks were created
  };

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
  const getTriggerSummary = (program: ServiceProgramRow): string => {
    if (!program.triggers || program.triggers.length === 0) return 'No triggers';
    return program.triggers
      .map((t) => {
        const typeLabel = TRIGGER_TYPE_LABELS[t.triggerType] || t.triggerType;
        if (t.triggerType === 'time' && t.timeUnit) {
          return `${t.interval} ${t.timeUnit}`;
        }
        return `${t.interval} ${typeLabel.toLowerCase()}`;
      })
      .join(', ');
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
      key: 'category',
      header: 'Category',
      label: 'Category',
      render: (program) => (
        <Badge variant="secondary" className="capitalize text-xs">
          {CATEGORY_LABELS[program.category] || program.category}
        </Badge>
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
      key: 'triggers',
      header: 'Triggers',
      label: 'Triggers',
      render: (program) => (
        <span className="text-muted-foreground text-sm">
          {getTriggerSummary(program)}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      label: 'Description',
      render: (program) => (
        <span className="text-muted-foreground truncate max-w-[200px] inline-block">
          {program.description || '—'}
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
          <Button variant="ghost" size="icon-sm" className="cursor-pointer" onClick={() => handleOpenEdit(program)}>
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
    <div className="relative flex h-full">
      {/* Left — Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h1 className="text-2xl font-semibold text-foreground">
            Service Programs
            <span className="text-muted-foreground font-normal ml-2">({pagination.total})</span>
          </h1>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Add Program
          </Button>
        </div>

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
            filterDefs={CATEGORY_FILTER}
            filters={filters}
            onFilterChange={setFilter}
            onFiltersClear={clearFilters}
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
      </div>

      {/* Overlay backdrop */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={handleClosePanel}
        />
      )}

      {/* Right Panel — Service Program Form (slide-out) */}
      <div
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-[460px] border-l border-border bg-background transition-transform duration-300',
          panelOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {panelOpen && (
          <ServiceProgramForm
            mode={panelMode}
            program={editingProgram}
            onClose={handleClosePanel}
            onSaved={handleSaved}
          />
        )}
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
                if (viewProgram) handleOpenEdit(viewProgram);
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
  return (
    <div className="space-y-6">
      {/* Details */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Details</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <ViewField label="Title" value={program.title} />
          <ViewField label="Description" value={program.description} />
          <ViewField
            label="Category"
            value={CATEGORY_LABELS[program.category] || program.category}
          />
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

      {/* Triggers */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Intervals / Triggers</h3>
        <Separator className="mb-4" />
        {(!program.triggers || program.triggers.length === 0) ? (
          <p className="text-sm text-muted-foreground">No triggers configured.</p>
        ) : (
          <div className="space-y-3">
            {program.triggers.map((trigger, idx) => (
              <div
                key={idx}
                className="rounded-md border border-border p-3 space-y-1"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs capitalize">
                    {trigger.intervalType === 'one_time' ? 'One Time' : 'Repeat'}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {TRIGGER_TYPE_LABELS[trigger.triggerType] || trigger.triggerType}
                  </Badge>
                </div>
                <p className="text-sm text-foreground">
                  Every {trigger.interval}{' '}
                  {trigger.triggerType === 'time'
                    ? trigger.timeUnit || 'days'
                    : trigger.triggerType === 'distance'
                      ? 'miles/km'
                      : 'hours'}
                </p>
                {trigger.reminderThreshold != null && trigger.reminderThreshold > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Reminder: {trigger.reminderThreshold}{' '}
                    {trigger.triggerType === 'time'
                      ? 'days'
                      : trigger.triggerType === 'distance'
                        ? 'miles/km'
                        : 'hours'}{' '}
                    before due
                  </p>
                )}
              </div>
            ))}
          </div>
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
