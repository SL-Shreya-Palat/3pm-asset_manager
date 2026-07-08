'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Plus, Edit, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { AddressInput } from '@/components/ui/address-input';
import { Badge } from '@/components/ui/badge';
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
import { SourceBadge, CommandManagedBanner } from '@/components/command/source-badge';
import { PermissionGuard } from '@/components/auth/permission-guard';

/** Generic settings item shape. */
export interface SettingsItem {
  id: string;
  name: string;
  symbol?: string;
  description?: string;
  isDefault?: boolean;
  /** 'command' when mastered in Command (read-only, auto-synced), else 'local'. */
  source?: string;
}

/** Field configuration for the create/edit dialog. */
export interface SettingsFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'checkbox' | 'address';
  required?: boolean;
  placeholder?: string;
  helpText?: string;
}

interface InventorySettingsListProps {
  title: string;
  apiEndpoint: string;
  fields: SettingsFieldConfig[];
  createLabel: string;
  nameField?: string; // the field key used as the display name column (default: 'name')
  extraColumns?: Array<{ key: string; header: string }>;
  /** Optional callback fired after a create, update, or delete succeeds. */
  onDataChange?: () => void;
  /**
   * When true, this lookup is mastered in Command: hide create, mark
   * Command-sourced rows read-only + badge them, and show the managed banner.
   */
  commandManaged?: boolean;
  /** Optional permission strings for guarding actions. If omitted, buttons render normally. */
  permissions?: {
    create?: string;
    edit?: string;
    archive?: string;
    delete?: string;
  };
}

export function InventorySettingsList({
  title,
  apiEndpoint,
  fields,
  createLabel,
  nameField = 'name',
  extraColumns = [],
  onDataChange,
  commandManaged = false,
  permissions,
}: InventorySettingsListProps) {
  const [items, setItems] = useState<SettingsItem[]>([]);
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
  const [editingItem, setEditingItem] = useState<SettingsItem | null>(null);
  const [formData, setFormData] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingItem, setArchivingItem] = useState<SettingsItem | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Delete dialog (permanent delete for archived items)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<SettingsItem | null>(null);
  const [deleting, setDeleting] = useState(false);

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
  }, [apiEndpoint, debouncedSearch, showArchived]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

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
  const columns: DataTableColumn<SettingsItem>[] = useMemo(() => {
    const cols: DataTableColumn<SettingsItem>[] = [
      {
        key: 'name',
        header: 'Name',
        pinned: true,
        render: (item) => (
          <span className="font-medium text-foreground">
            {(item as unknown as Record<string, unknown>)[nameField] as string}
            {item.isDefault && (
              <Badge variant="secondary" className="ml-2 text-xs">Default</Badge>
            )}
          </span>
        ),
      },
      ...extraColumns.map((col) => ({
        key: col.key,
        header: col.header,
        render: (item: SettingsItem) => (
          <span className="text-muted-foreground">
            {(item as unknown as Record<string, unknown>)[col.key] as string || '—'}
          </span>
        ),
      })),
      {
        key: 'description',
        header: 'Description',
        render: (item) => (
          <span className="text-muted-foreground">{item.description || '—'}</span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right' as const,
        pinned: true,
        render: (item) => {
          // Command-mastered rows are read-only here — no Edit/Archive.
          const isCommandRow = commandManaged && item.source === 'command';
          if (isCommandRow) return null;

          const unarchiveButton = (
            <RowActionButton
              label="Unarchive"
              icon={<ArchiveRestore />}
              onClick={() => { setArchivingItem(item); setArchiveDialogOpen(true); }}
            />
          );
          const deleteButton = (
            <RowActionButton
              label="Delete"
              tone="destructive"
              icon={<Trash2 />}
              onClick={() => { setDeletingItem(item); setDeleteDialogOpen(true); }}
            />
          );
          const editButton = (
            <RowActionButton label="Edit" icon={<Edit />} onClick={() => openEditDialog(item)} />
          );
          const archiveButton = (
            <RowActionButton
              label="Archive"
              icon={<Archive />}
              onClick={() => { setArchivingItem(item); setArchiveDialogOpen(true); }}
            />
          );

          return (
            <RowActions>
              {showArchived ? (
                <>
                  {permissions?.archive ? (
                    <PermissionGuard permission={permissions.archive}>{unarchiveButton}</PermissionGuard>
                  ) : unarchiveButton}
                  {permissions?.delete ? (
                    <PermissionGuard permission={permissions.delete}>{deleteButton}</PermissionGuard>
                  ) : deleteButton}
                </>
              ) : (
                <>
                  {permissions?.edit ? (
                    <PermissionGuard permission={permissions.edit}>{editButton}</PermissionGuard>
                  ) : editButton}
                  {permissions?.archive ? (
                    <PermissionGuard permission={permissions.archive}>{archiveButton}</PermissionGuard>
                  ) : archiveButton}
                </>
              )}
            </RowActions>
          );
        },
      },
    ];
    // Source column (Command / Local) only when this lookup is Command-managed.
    if (commandManaged) {
      cols.splice(cols.length - 1, 0, {
        key: 'source',
        header: 'Source',
        render: (item) => <SourceBadge source={item.source} />,
      });
    }
    return cols;
  }, [nameField, extraColumns, showArchived, commandManaged, permissions]);

  // Dialog helpers
  const openCreateDialog = () => {
    setDialogMode('create');
    setEditingItem(null);
    const initial: Record<string, string | boolean> = {};
    fields.forEach((f) => {
      initial[f.key] = f.type === 'checkbox' ? false : '';
    });
    setFormData(initial);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const openEditDialog = (item: SettingsItem) => {
    setDialogMode('edit');
    setEditingItem(item);
    const initial: Record<string, string | boolean> = {};
    fields.forEach((f) => {
      const val = (item as unknown as Record<string, unknown>)[f.key];
      initial[f.key] = f.type === 'checkbox' ? (val === true) : (val as string || '');
    });
    setFormData(initial);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setFieldErrors({});
    // Client-side required check
    const errors: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.required && f.type !== 'checkbox') {
        const val = formData[f.key];
        if (!val || (typeof val === 'string' && !val.trim())) {
          errors[f.key] = `${f.label} is required`;
        }
      }
    });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      setSaving(true);
      if (dialogMode === 'edit' && editingItem) {
        await axios.put(apiEndpoint, { id: editingItem.id, ...formData }, { withCredentials: true });
      } else {
        await axios.post(apiEndpoint, formData, { withCredentials: true });
      }
      setDialogOpen(false);
      fetchItems();
      onDataChange?.();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const errData = err.response.data.error;
        if (typeof errData === 'object') {
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
      onDataChange?.();
    } catch {
      // Silent fail
    } finally {
      setArchiving(false);
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
      onDataChange?.();
    } catch {
      // Silent fail
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <ShowArchivedToggle checked={showArchived} onCheckedChange={setShowArchived} />
        </div>
        {!showArchived && !commandManaged && (
          permissions?.create ? (
            <PermissionGuard permission={permissions.create}>
              <Button size="sm" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" />
                {createLabel}
              </Button>
            </PermissionGuard>
          ) : (
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" />
              {createLabel}
            </Button>
          )
        )}
      </div>

      {commandManaged && <CommandManagedBanner className="mb-4" />}

      {/* Toolbar */}
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
            placeholder={`Search ${title.toLowerCase()}...`}
          />
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
        emptyMessage={debouncedSearch ? 'No results match your search.' : showArchived ? `No archived ${title.toLowerCase()}.` : `No ${title.toLowerCase()} yet.`}
      />

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'edit' ? `Edit ${title.replace(/s$/, '')}` : createLabel}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'edit' ? 'Update the details below.' : 'Fill in the details to create a new item.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {fields.map((field) => (
              <div key={field.key}>
                {field.type === 'checkbox' ? (
                  <label className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData[field.key] === true}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, [field.key]: checked === true }))
                      }
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm text-foreground">{field.label}</span>
                      {field.helpText && (
                        <p className="text-xs text-muted-foreground mt-0.5">{field.helpText}</p>
                      )}
                    </div>
                  </label>
                ) : (
                  <>
                    <Label>
                      {field.label}
                      {field.required && <span className="text-destructive"> *</span>}
                    </Label>
                    {field.type === 'textarea' ? (
                      <Textarea
                        value={formData[field.key] as string || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                        rows={3}
                        className={`mt-1.5 ${fieldErrors[field.key] ? 'border-destructive' : ''}`}
                      />
                    ) : field.type === 'address' ? (
                      <AddressInput
                        value={formData[field.key] as string || ''}
                        onChange={(v) =>
                          setFormData((prev) => ({ ...prev, [field.key]: v }))
                        }
                        placeholder={field.placeholder}
                        className={`mt-1.5 ${fieldErrors[field.key] ? '[&_input]:border-destructive' : ''}`}
                      />
                    ) : (
                      <Input
                        value={formData[field.key] as string || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                        className={`mt-1.5 ${fieldErrors[field.key] ? 'border-destructive' : ''}`}
                      />
                    )}
                    {fieldErrors[field.key] && (
                      <p className="text-sm text-destructive mt-1">{fieldErrors[field.key]}</p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : dialogMode === 'edit' ? 'Update' : createLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive / Unarchive Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={(archivingItem as unknown as Record<string, unknown>)?.[nameField] as string}
        action={showArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Permanent Delete Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={(deletingItem as unknown as Record<string, unknown>)?.[nameField] as string}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
