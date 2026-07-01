'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Plus, Pencil, Trash2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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

interface WorkOrderStatusItem {
  id: string;
  label: string;
  color: string;
  description?: string;
  approvalRequired: boolean;
  sequence: number;
  workOrderCount: number;
}

const DEFAULT_COLOR = '#3B82F6';

export function WorkOrderStatusesList() {
  const [items, setItems] = useState<WorkOrderStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);

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
  const [formApprovalRequired, setFormApprovalRequired] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<WorkOrderStatusItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const apiEndpoint = '/api/work-order-statuses';

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await axios.get(`${apiEndpoint}?${params.toString()}`, { withCredentials: true });
      setItems(res.data.data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

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
        <span className="font-medium text-foreground">
          {item.label}
          {item.approvalRequired && (
            <span className="text-xs text-muted-foreground ml-1">*</span>
          )}
        </span>
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
      key: 'sequence',
      header: 'Sequence',
      align: 'center',
      render: (item) => (
        <span className="text-muted-foreground">{item.sequence}</span>
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
          <RowActionButton label="Edit" icon={<Pencil />} onClick={() => openEditDialog(item)} />
          <RowActionButton
            label="Delete"
            tone="destructive"
            icon={<Trash2 />}
            onClick={() => { setDeletingItem(item); setDeleteDialogOpen(true); }}
          />
        </RowActions>
      ),
    },
  ], []);

  const openCreateDialog = () => {
    setDialogMode('create');
    setEditingItem(null);
    setFormLabel('');
    setFormColor(DEFAULT_COLOR);
    setFormDescription('');
    setFormApprovalRequired(false);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const openEditDialog = (item: WorkOrderStatusItem) => {
    setDialogMode('edit');
    setEditingItem(item);
    setFormLabel(item.label);
    setFormColor(item.color);
    setFormDescription(item.description || '');
    setFormApprovalRequired(item.approvalRequired);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setFieldErrors({});
    const errors: Record<string, string> = {};
    if (!formLabel.trim()) errors.label = 'Label is required';
    if (!formColor.trim()) errors.color = 'Color is required';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    const payload = {
      label: formLabel.trim(),
      color: formColor.trim(),
      description: formDescription.trim() || undefined,
      approvalRequired: formApprovalRequired,
    };

    try {
      setSaving(true);
      if (dialogMode === 'edit' && editingItem) {
        await axios.put(apiEndpoint, { id: editingItem.id, ...payload }, { withCredentials: true });
      } else {
        await axios.post(apiEndpoint, payload, { withCredentials: true });
      }
      setDialogOpen(false);
      fetchItems();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const errData = err.response.data.error;
        if (typeof errData === 'object') setFieldErrors(errData as Record<string, string>);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    setDeleting(true);
    try {
      await axios.delete(`${apiEndpoint}?id=${deletingItem.id}`, { withCredentials: true });
      setDeleteDialogOpen(false);
      setDeletingItem(null);
      fetchItems();
    } catch { /* silent */ } finally { setDeleting(false); }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Work Order Statuses</h2>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          Add Status
        </Button>
      </div>

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
        emptyMessage={debouncedSearch ? 'No results match your search.' : 'No work order statuses yet.'}
      />

      {/* Visual Status Flow */}
      {items.length > 0 && (
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
                    {item.approvalRequired && <span className="text-destructive">*</span>}
                  </span>
                </div>
                {idx < items.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Statuses with asterisk (*) require approval before changing their status
          </p>
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

            {/* Approval Required */}
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={formApprovalRequired}
                onCheckedChange={(checked) => setFormApprovalRequired(checked === true)}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm text-foreground">Approval required</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, work orders must be approved before moving to this status.
                </p>
              </div>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : dialogMode === 'edit' ? 'Update' : 'Add Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Status</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingItem?.label}&quot;? This action cannot be undone.
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
