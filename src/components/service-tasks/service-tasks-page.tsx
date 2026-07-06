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
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { ShowArchivedToggle } from '@/components/ui/show-archived-toggle';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { cn } from '@/lib/utils';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import { ServiceTaskForm } from './service-task-form';
import type { ServiceTaskRow, Pagination } from './types';

export function ServiceTasksPage() {
  const router = useRouter();
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

  // Archive state
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingTask, setArchivingTask] = useState<ServiceTaskRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Delete state
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
      if (showArchived) params.set('showArchived', 'true');

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
  }, [rowsPerPage, debouncedSearch, showArchived]);

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

  // ── Archive handlers ──
  const handleOpenArchive = (task: ServiceTaskRow) => {
    setArchivingTask(task);
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    if (!archivingTask) return;
    setArchiving(true);
    try {
      await axios.patch(`/api/service-tasks/${archivingTask.id}/archive`, { archived: !showArchived }, { withCredentials: true });
      setArchiveDialogOpen(false);
      setArchivingTask(null);
      fetchTasks(pagination.page);
    } catch (err) {
      console.error('Failed to archive/unarchive service task:', err);
    } finally {
      setArchiving(false);
    }
  };

  // Delete handlers
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
        <RowActions>
          {!showArchived && (
            <>
              <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => router.push(`/maintenance/service-tasks/${task.id}`)} />
              <RowActionButton label="Edit" icon={<Edit />} onClick={() => handleOpenEdit(task)} />
              <RowActionButton label="Archive" icon={<Archive />} onClick={() => handleOpenArchive(task)} />
            </>
          )}
          {showArchived && (
            <>
              <RowActionButton label="Unarchive" icon={<ArchiveRestore />} onClick={() => handleOpenArchive(task)} />
              <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(task)} />
            </>
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="relative flex h-full">
      {/* Left — Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <PageHeader title="Service Tasks" description="Manage individual maintenance tasks and checklists" count={pagination.total}>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Add Service Task
          </Button>
        </PageHeader>

        {/* Toolbar + Table */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          <DataTableToolbar
            columns={taskColumns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
            afterControls={
              <ShowArchivedToggle checked={showArchived} onCheckedChange={setShowArchived} />
            }
            searchNode={
              <SearchInput value={search} onChange={setSearch} placeholder="Search service tasks..." />
            }
          />
          <DataTable<ServiceTaskRow>
            columns={taskColumns}
            data={tasks}
            pagination={pagination}
            loading={loading}
            rowsPerPage={rowsPerPage}
            onPageChange={fetchTasks}
            onRowsPerPageChange={setRowsPerPage}
            onRowClick={showArchived ? undefined : (task) => router.push(`/maintenance/service-tasks/${task.id}`)}
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

      {/* Archive Service Task Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={archivingTask?.title}
        action={showArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Delete Service Task Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingTask?.title}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

