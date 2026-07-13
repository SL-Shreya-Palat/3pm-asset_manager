'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Plus, Edit, Trash2, ArrowRight, Archive, ArchiveRestore } from 'lucide-react';
import { Button, LoadingButton } from '@/components/ui/button';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn, type DataTablePagination } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { ShowArchivedToggle } from '@/components/ui/show-archived-toggle';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Permissions } from '@/consts/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { checkRecordOwnership } from '@/lib/rbac';
import { showSuccessToast, showErrorToast } from '@/lib/toastUtils';

const STATUS_TYPES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

type StatusType = (typeof STATUS_TYPES)[number]['value'];

const STATUS_TYPE_LABEL_MAP: Record<StatusType, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

interface WorkOrderStatusItem {
  id: string;
  label: string;
  color: string;
  description?: string;
  type: StatusType;
  sequence: number;
  workOrderCount: number;
  createdBy?: string | null;
  /** Default lifecycle status seeded for every tenant — can't be archived/deleted. */
  isSystem?: boolean;
}

const DEFAULT_COLOR = '#3B82F6';

const WO_STATUS_FORM_ID = 'settings.workOrderStatuses.workOrderStatus';

export function WorkOrderStatusesList() {
  const { user } = useAuth();
  const { hasFullAccess, permissionIndex } = useRoleAccess();

  // Permission levels for row-level "OWN" checks
  const editLevel = hasFullAccess ? 'ALL' as const : permissionIndex.getEditLevel(WO_STATUS_FORM_ID);
  const archiveLevel = hasFullAccess ? 'ALL' as const : permissionIndex.getArchiveLevel(WO_STATUS_FORM_ID);
  const deleteLevel = hasFullAccess ? 'ALL' as const : permissionIndex.getDeleteLevel(WO_STATUS_FORM_ID);

  const [items, setItems] = useState<WorkOrderStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [showArchived, setShowArchived] = useState(false);

  // Table state
  const { hiddenColumnKeys, setHiddenColumnKeys, density, setDensity } = useDataTable();
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingItem, setEditingItem] = useState<WorkOrderStatusItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields
  const [formLabel, setFormLabel] = useState('');
  const [formColor, setFormColor] = useState(DEFAULT_COLOR);
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<StatusType>('open');

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingItem, setArchivingItem] = useState<WorkOrderStatusItem | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Delete dialog (permanent delete for archived items)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<WorkOrderStatusItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // General API error (shown as inline alert, auto-dismissed)
  const [apiError, setApiError] = useState<string | null>(null);
  useEffect(() => {
    if (!apiError) return;
    const t = setTimeout(() => setApiError(null), 5000);
    return () => clearTimeout(t);
  }, [apiError]);

  const apiEndpoint = '/api/work-order-statuses';

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (showArchived) params.set('showArchived', 'true');
      const res = await axios.get(`${apiEndpoint}?${params.toString()}`, { withCredentials: true });
      setItems(res.data.data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, showArchived]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Reset to page 1 when search or showArchived changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, showArchived]);

  // Client-side pagination
  const paginatedData = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return items.slice(start, start + rowsPerPage);
  }, [items, page, rowsPerPage]);

  const pagination: DataTablePagination = useMemo(() => ({
    page,
    limit: rowsPerPage,
    total: items.length,
    hasMore: page * rowsPerPage < items.length,
  }), [page, rowsPerPage, items.length]);

  // Columns
  const columns: DataTableColumn<WorkOrderStatusItem>[] = useMemo(() => [
    {
      key: 'color',
      header: 'Color',
      className: 'w-[60px]',
      render: (item) => (
        <div
          className="h-5 w-5 rounded-full border border-border"
          style={{ backgroundColor: item.color }}
        />
      ),
    },
    {
      key: 'label',
      header: 'Label',
      pinned: true,
      render: (item) => (
        <span className="font-medium text-foreground">{item.label}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (item) => (
        <span className="text-muted-foreground">{STATUS_TYPE_LABEL_MAP[item.type] || item.type}</span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (item) => (
        <span className="text-muted-foreground">{item.description || '—'}</span>
      ),
    },
    {
      key: 'workOrderCount',
      header: 'No. of Work Orders',
      align: 'center',
      render: (item) => (
        <span className="text-muted-foreground">{item.workOrderCount}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      pinned: true,
      render: (item) => (
        <RowActions>
          {showArchived ? (
            <>
              {checkRecordOwnership(archiveLevel, item.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.settings.workOrderStatuses.form.archive}>
                  <RowActionButton
                    label="Unarchive"
                    icon={<ArchiveRestore />}
                    onClick={() => { setArchivingItem(item); setArchiveDialogOpen(true); }}
                  />
                </PermissionGuard>
              )}
              {!item.isSystem && checkRecordOwnership(deleteLevel, item.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.settings.workOrderStatuses.form.delete}>
                  <RowActionButton
                    label="Delete"
                    tone="destructive"
                    icon={<Trash2 />}
                    onClick={() => { setDeletingItem(item); setDeleteDialogOpen(true); }}
                  />
                </PermissionGuard>
              )}
            </>
          ) : (
            <>
              {checkRecordOwnership(editLevel, item.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.settings.workOrderStatuses.form.edit}>
                  <RowActionButton label="Edit" icon={<Edit />} onClick={() => openEditDialog(item)} />
                </PermissionGuard>
              )}
              {!item.isSystem && checkRecordOwnership(archiveLevel, item.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.settings.workOrderStatuses.form.archive}>
                  <RowActionButton
                    label="Archive"
                    icon={<Archive />}
                    onClick={() => { setArchivingItem(item); setArchiveDialogOpen(true); }}
                  />
                </PermissionGuard>
              )}
            </>
          )}
        </RowActions>
      ),
    },
  ], [showArchived, user?.id, editLevel, archiveLevel, deleteLevel]);

  const openCreateDialog = () => {
    setDialogMode('create');
    setEditingItem(null);
    setFormLabel('');
    setFormColor(DEFAULT_COLOR);
    setFormDescription('');
    setFormType('open');
    setFieldErrors({});
    setDialogOpen(true);
  };

  const openEditDialog = (item: WorkOrderStatusItem) => {
    setDialogMode('edit');
    setEditingItem(item);
    setFormLabel(item.label);
    setFormColor(item.color);
    setFormDescription(item.description || '');
    setFormType(item.type);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setFieldErrors({});
    const errors: Record<string, string> = {};
    if (!formLabel.trim()) errors.label = 'Label is required';
    if (!formColor.trim()) errors.color = 'Color is required';
    if (!formType) errors.type = 'Type is required';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    const payload = {
      label: formLabel.trim(),
      color: formColor.trim(),
      description: formDescription.trim() || undefined,
      type: formType,
    };

    try {
      setSaving(true);
      if (dialogMode === 'edit' && editingItem) {
        await axios.put(apiEndpoint, { id: editingItem.id, ...payload }, { withCredentials: true });
      } else {
        await axios.post(apiEndpoint, payload, { withCredentials: true });
      }
      showSuccessToast(dialogMode === 'edit' ? 'Work order status updated successfully' : 'Work order status created successfully');
      setDialogOpen(false);
      fetchItems();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const errData = err.response.data.error;
        if (typeof errData === 'string') {
          showErrorToast(errData);
          setApiError(errData);
          setDialogOpen(false);
        } else if (typeof errData === 'object') {
          setFieldErrors(errData as Record<string, string>);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!archivingItem) return;
    setArchiving(true);
    try {
      await axios.patch(apiEndpoint, { id: archivingItem.id, archived: !showArchived }, { withCredentials: true });
      setArchiveDialogOpen(false);
      setArchivingItem(null);
      fetchItems();
    } catch (err) {
      setArchiveDialogOpen(false);
      setArchivingItem(null);
      if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
        setApiError(err.response.data.error);
      }
    } finally { setArchiving(false); }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    setDeleting(true);
    try {
      await axios.delete(`${apiEndpoint}?id=${deletingItem.id}`, { withCredentials: true });
      setDeleteDialogOpen(false);
      setDeletingItem(null);
      fetchItems();
    } catch (err) {
      setDeleteDialogOpen(false);
      setDeletingItem(null);
      if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
        setApiError(err.response.data.error);
      }
    } finally { setDeleting(false); }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-foreground">Work Order Statuses</h2>
          <ShowArchivedToggle checked={showArchived} onCheckedChange={setShowArchived} />
        </div>
        {!showArchived && (
          <PermissionGuard permission={Permissions.settings.workOrderStatuses.form.create}>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" />
              Add Status
            </Button>
          </PermissionGuard>
        )}
      </div>

      {/* API error alert */}
      {apiError && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{apiError}</span>
          <button onClick={() => setApiError(null)} className="ml-4 text-destructive/70 hover:text-destructive">
            &times;
          </button>
        </div>
      )}

      {/* Toolbar */}
      <DataTableToolbar
        columns={columns}
        hiddenColumnKeys={hiddenColumnKeys}
        onHiddenColumnKeysChange={setHiddenColumnKeys}
        density={density}
        onDensityChange={setDensity}
        searchNode={
          <SearchInput value={search} onChange={setSearch} placeholder="Search statuses..." />
        }
      />

      {/* Table */}
      <DataTable
        columns={columns}
        data={paginatedData}
        pagination={pagination}
        loading={loading}
        onPageChange={setPage}
        onRowsPerPageChange={(rpp) => { setRowsPerPage(rpp); setPage(1); }}
        rowsPerPage={rowsPerPage}
        density={density}
        hiddenColumnKeys={hiddenColumnKeys}
        emptyMessage={debouncedSearch ? 'No results match your search.' : showArchived ? 'No archived statuses.' : 'No work order statuses yet.'}
      />

      {/* Visual Status Flow (only for active items) */}
      {!showArchived && items.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-foreground mb-1">Your work order status flow</h3>
          <p className="text-xs text-muted-foreground mb-4">
            This is a visual representation of your work order status flow.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {items.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5">
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-foreground whitespace-nowrap">
                    {item.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {STATUS_TYPE_LABEL_MAP[item.type] || item.type}
                  </span>
                </div>
                {idx < items.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'edit' ? 'Edit Status' : 'Add Status'}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'edit' ? 'Update the status details below.' : 'Create a new work order status.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Label */}
            <div>
              <Label>Label <span className="text-destructive">*</span></Label>
              <Input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="e.g. In Progress"
                className={`mt-1.5 ${fieldErrors.label ? 'border-destructive' : ''}`}
              />
              {fieldErrors.label && <p className="text-sm text-destructive mt-1">{fieldErrors.label}</p>}
            </div>

            {/* Color */}
            <div>
              <Label>Color <span className="text-destructive">*</span></Label>
              <div className="flex items-center gap-3 mt-1.5">
                <input
                  type="color"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                />
                <Input
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  placeholder="#3B82F6"
                  className={`flex-1 font-mono text-sm ${fieldErrors.color ? 'border-destructive' : ''}`}
                />
              </div>
              {fieldErrors.color && <p className="text-sm text-destructive mt-1">{fieldErrors.color}</p>}
            </div>

            {/* Type */}
            <div>
              <Label>Type <span className="text-destructive">*</span></Label>
              <Select value={formType} onValueChange={(val) => setFormType(val as StatusType)}>
                <SelectTrigger className={`mt-1.5 ${fieldErrors.type ? 'border-destructive' : ''}`}>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.type && <p className="text-sm text-destructive mt-1">{fieldErrors.type}</p>}
            </div>

            {/* Description */}
            <div>
              <Label>Description</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <LoadingButton onClick={handleSave} loading={saving}>
              {dialogMode === 'edit' ? 'Update' : 'Add Status'}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive / Unarchive Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={archivingItem?.label}
        action={showArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Permanent Delete Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingItem?.label}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
