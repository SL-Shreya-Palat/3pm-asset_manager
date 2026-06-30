'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import { ServiceTaskForm } from './service-task-form';
import type { ServiceTaskRow, Pagination } from './types';

export function ServiceTasksPage() {
  const [tasks, setTasks] = useState<ServiceTaskRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Table features
  const {
    hiddenColumnKeys, setHiddenColumnKeys,
    density, setDensity,
  } = useDataTable();

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create');
  const [editingTask, setEditingTask] = useState<ServiceTaskRow | null>(null);

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewTask, setViewTask] = useState<ServiceTaskRow | null>(null);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTask, setDeletingTask] = useState<ServiceTaskRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch service tasks ──
  const fetchTasks = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await axios.get(`/api/service-tasks?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setTasks(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch service tasks:', err);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage, debouncedSearch]);

  useEffect(() => {
    fetchTasks(1);
  }, [fetchTasks]);

  // ── Panel handlers ──
  const handleOpenCreate = () => {
    setEditingTask(null);
    setPanelMode('create');
    setPanelOpen(true);
  };

  const handleOpenEdit = (task: ServiceTaskRow) => {
    setEditingTask(task);
    setPanelMode('edit');
    setPanelOpen(true);
  };

  const handleClosePanel = () => {
    setPanelOpen(false);
    setEditingTask(null);
  };

  const handleSaved = () => {
    handleClosePanel();
    fetchTasks(panelMode === 'create' ? 1 : pagination.page);
  };

  // ── View dialog ──
  const handleOpenView = (task: ServiceTaskRow) => {
    setViewTask(task);
    setViewDialogOpen(true);
  };

  // ── Delete dialog ──
  const handleOpenDelete = (task: ServiceTaskRow) => {
    setDeletingTask(task);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingTask) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/service-tasks/${deletingTask.id}`, { withCredentials: true });
      setDeleteDialogOpen(false);
      setDeletingTask(null);
      fetchTasks(pagination.page);
    } catch (err) {
      console.error('Failed to delete service task:', err);
    } finally {
      setDeleting(false);
    }
  };

  // ── Column definitions ──
  const taskColumns: DataTableColumn<ServiceTaskRow>[] = [
    {
      key: 'title',
      header: 'Title',
      label: 'Title',
      pinned: true,
      render: (task) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Wrench className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground">{task.title}</span>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      label: 'Description',
      render: (task) => (
        <span className="text-muted-foreground truncate max-w-[300px] inline-block">
          {task.description || '—'}
        </span>
      ),
    },
    {
      key: 'laborCost',
      header: 'Labor',
      label: 'Labor ($)',
      render: (task) => (
        <span className="text-muted-foreground">
          {task.laborCost != null ? `$${task.laborCost.toFixed(2)}` : '—'}
        </span>
      ),
    },
    {
      key: 'partsCost',
      header: 'Parts',
      label: 'Parts ($)',
      render: (task) => (
        <span className="text-muted-foreground">
          {task.partsCost != null ? `$${task.partsCost.toFixed(2)}` : '—'}
        </span>
      ),
    },
    {
      key: 'totalCost',
      header: 'Total',
      label: 'Total ($)',
      render: (task) => (
        <Badge variant="secondary">
          {task.totalCost != null ? `$${task.totalCost.toFixed(2)}` : '—'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (task) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" className="cursor-pointer" onClick={() => handleOpenView(task)}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="cursor-pointer" onClick={() => handleOpenEdit(task)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="cursor-pointer text-destructive hover:text-destructive" onClick={() => handleOpenDelete(task)}>
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
            Service Tasks
            <span className="text-muted-foreground font-normal ml-2">({pagination.total})</span>
          </h1>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Add Service Task
          </Button>
        </div>

        {/* Search */}
        <div className="px-6 pb-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search service tasks..."
          />
        </div>

        {/* Toolbar + Table */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          <DataTableToolbar
            columns={taskColumns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
          />
          <DataTable<ServiceTaskRow>
            columns={taskColumns}
            data={tasks}
            pagination={pagination}
            loading={loading}
            rowsPerPage={rowsPerPage}
            onPageChange={fetchTasks}
            onRowsPerPageChange={setRowsPerPage}
            onRowClick={handleOpenView}
            rowKey={(t) => t.id}
            density={density}
            hiddenColumnKeys={hiddenColumnKeys}
            emptyMessage={
              debouncedSearch
                ? 'No service tasks match your search.'
                : 'No service tasks yet. Click "Add Service Task" to create one.'
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

      {/* Right Panel — Service Task Form (slide-out) */}
      <div
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-[460px] border-l border-border bg-background transition-transform duration-300',
          panelOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {panelOpen && (
          <ServiceTaskForm
            mode={panelMode}
            task={editingTask}
            onClose={handleClosePanel}
            onSaved={handleSaved}
          />
        )}
      </div>

      {/* View Service Task Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewTask?.title || 'Service Task Details'}</DialogTitle>
            <DialogDescription>Service task information overview.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {viewTask && <ViewServiceTaskContent task={viewTask} />}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setViewDialogOpen(false);
                if (viewTask) handleOpenEdit(viewTask);
              }}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Service Task Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Service Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingTask?.title}&quot;? This action cannot be undone.
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

/** Read-only view of service task details shown in the view dialog. */
function ViewServiceTaskContent({ task }: { task: ServiceTaskRow }) {
  return (
    <div className="space-y-6">
      {/* Details */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Details</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <ViewField label="Title" value={task.title} />
          <ViewField label="Description" value={task.description} />
        </div>
      </div>

      {/* Cost */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Cost</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <ViewField
              label="Labor"
              value={task.laborCost != null ? `$${task.laborCost.toFixed(2)}` : undefined}
            />
            <ViewField
              label="Parts"
              value={task.partsCost != null ? `$${task.partsCost.toFixed(2)}` : undefined}
            />
            <ViewField
              label="Total"
              value={task.totalCost != null ? `$${task.totalCost.toFixed(2)}` : undefined}
            />
          </div>
        </div>
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
