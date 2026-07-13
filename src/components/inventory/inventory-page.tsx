'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Plus,
  Edit,
  Archive,
  ArchiveRestore,
  Trash2,
  Eye,
  Package,
  Barcode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/ui/search-input';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type DataTableColumn, type DataTableFilterDef } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { ShowArchivedToggle } from '@/components/ui/show-archived-toggle';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Permissions } from '@/consts/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { checkRecordOwnership } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable, applyTableFilters } from '@/hooks/use-data-table';
import { useConnection } from '@/hooks/use-connection';
import { SourceBadge, CommandManagedBanner } from '@/components/command/source-badge';
import { GenerateBarcodeDialog } from '@/components/assets/generate-barcode-dialog';
import { PartForm } from './part-form';
import type { PartRow, LookupOption, Pagination } from './types';

// ── Stock helpers (pure — shared by the table and the detail view) ──

/** Total on-hand across all locations. */
function getTotalStock(part: PartRow): number {
  return (part.stockLocations || []).reduce((sum, s) => sum + s.quantity, 0);
}

/** Stock status label + tone: out of stock (≤0) → low stock (≤ reorder point) → in stock. */
function getStockStatus(
  part: PartRow,
  total: number,
): { label: string; variant: 'success' | 'warning' | 'destructive' } {
  if (total <= 0) return { label: 'Out of stock', variant: 'destructive' };
  if (part.reorderPoint != null && total <= part.reorderPoint) return { label: 'Low stock', variant: 'warning' };
  return { label: 'In stock', variant: 'success' };
}

/** Unit price used for costing — the first vendor cost above 0 (0 = unpriced). */
function getUnitPrice(part: PartRow): number {
  const vendor = (part.vendors || []).find((v) => v.unitCost > 0);
  return vendor ? vendor.unitCost : 0;
}

/** A part is "unpriced" when no vendor has a unit cost above 0 — it costs $0 on work orders. */
function isUnpriced(part: PartRow): boolean {
  return getUnitPrice(part) <= 0;
}

const INVENTORY_FORM_ID = 'maintenance.inventory.inventoryItem';

export function InventoryPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { hasFullAccess, permissionIndex } = useRoleAccess();

  // Permission levels for row-level "OWN" checks
  const editLevel = hasFullAccess ? 'ALL' : permissionIndex.getEditLevel(INVENTORY_FORM_ID);
  const archiveLevel = hasFullAccess ? 'ALL' : permissionIndex.getArchiveLevel(INVENTORY_FORM_ID);
  const deleteLevel = hasFullAccess ? 'ALL' : permissionIndex.getDeleteLevel(INVENTORY_FORM_ID);

  const [parts, setParts] = useState<PartRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Connected to Command → stock is mastered there (read-only, auto-synced).
  const { connected } = useConnection();

  // Lookup maps
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [unitMap, setUnitMap] = useState<Record<string, string>>({});
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});
  const [vendorMap, setVendorMap] = useState<Record<string, string>>({});

  // Table features
  const {
    hiddenColumnKeys, setHiddenColumnKeys,
    density, setDensity,
    filters, setFilter, clearFilters,
  } = useDataTable();

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create');
  const [editingPart, setEditingPart] = useState<PartRow | null>(null);

  // Archive state
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingPart, setArchivingPart] = useState<PartRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingPart, setDeletingPart] = useState<PartRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Row selection & barcode dialog
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);

  const selectedParts = useMemo(
    () => parts.filter((p) => selectedKeys.has(p.id)),
    [parts, selectedKeys],
  );

  // Fetch lookup data
  const fetchLookups = useCallback(async () => {
    try {
      const [catRes, muRes, locRes, venRes] = await Promise.all([
        axios.get('/api/inventory-settings/part-categories', { withCredentials: true }),
        axios.get('/api/inventory-settings/measurement-units', { withCredentials: true }),
        axios.get('/api/inventory-settings/part-locations', { withCredentials: true }),
        axios.get('/api/vendors?limit=100', { withCredentials: true }),
      ]);
      const toMap = (items: LookupOption[]) => {
        const map: Record<string, string> = {};
        items.forEach((i) => { map[i.id] = i.name; });
        return map;
      };
      setCategoryMap(toMap(catRes.data.data || []));
      setUnitMap(toMap(muRes.data.data || []));
      setLocationMap(toMap(locRes.data.data || []));
      const vendorItems = venRes.data.data?.items || venRes.data.data || [];
      setVendorMap(toMap(vendorItems));
    } catch {
      // Silent
    }
  }, []);

  // Fetch parts
  const fetchParts = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (showArchived) params.set('showArchived', 'true');

      const res = await axios.get(`/api/parts?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setParts(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch parts:', err);
      setParts([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage, debouncedSearch, showArchived]);

  useEffect(() => { fetchLookups(); }, [fetchLookups]);
  useEffect(() => { fetchParts(1); }, [fetchParts]);

  // Panel handlers
  const handleOpenCreate = () => { setEditingPart(null); setPanelMode('create'); setPanelOpen(true); };
  const handleOpenEdit = (part: PartRow) => { setEditingPart(part); setPanelMode('edit'); setPanelOpen(true); };
  const handleClosePanel = () => { setPanelOpen(false); setEditingPart(null); };
  const handleSaved = () => {
    handleClosePanel();
    fetchParts(panelMode === 'create' ? 1 : pagination.page);
    fetchLookups();
  };

  // Archive
  const handleOpenArchive = (part: PartRow) => {
    setArchivingPart(part);
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    if (!archivingPart) return;
    setArchiving(true);
    try {
      await axios.patch(`/api/parts/${archivingPart.id}/archive`, { archived: !showArchived }, { withCredentials: true });
      setArchiveDialogOpen(false);
      setArchivingPart(null);
      fetchParts(pagination.page);
    } catch (err) {
      console.error('Failed to archive/unarchive part:', err);
    } finally {
      setArchiving(false);
    }
  };

  // Delete handlers
  const handleOpenDelete = (part: PartRow) => {
    setDeletingPart(part);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingPart) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/parts/${deletingPart.id}`, { withCredentials: true });
      setDeleteDialogOpen(false);
      setDeletingPart(null);
      fetchParts(pagination.page);
    } catch (err) {
      console.error('Failed to delete part:', err);
    } finally {
      setDeleting(false);
    }
  };

  // Column definitions
  const partColumns: DataTableColumn<PartRow>[] = [
    {
      key: 'name',
      header: 'Stock Name',
      label: 'Stock name',
      pinned: true,
      sortable: true,
      render: (part) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Package className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground">{part.name}</span>
          {isUnpriced(part) && (
            <Badge variant="warning" className="text-xs">Unpriced</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'partNumber',
      header: 'Stock #',
      label: 'Stock number',
      pinned: true,
      sortable: true,
      render: (part) => (
        <span className="text-muted-foreground font-mono text-xs">{part.partNumber}</span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      label: 'Category',
      sortable: true,
      render: (part) => (
        <span className="text-muted-foreground">{part.categoryId ? categoryMap[part.categoryId] || '—' : '—'}</span>
      ),
    },
    {
      key: 'totalStock',
      header: 'Stock',
      label: 'Total stock',
      sortable: true,
      sortValue: (part) => getTotalStock(part),
      render: (part) => {
        const total = getTotalStock(part);
        const status = getStockStatus(part, total);
        return (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground tabular-nums">{total}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        );
      },
    },
    {
      key: 'stockValue',
      header: 'Stock Value',
      label: 'Stock value',
      render: (part) => {
        const price = getUnitPrice(part);
        if (price <= 0) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="text-foreground tabular-nums">${(getTotalStock(part) * price).toFixed(2)}</span>
        );
      },
    },
    {
      key: 'reorderPoint',
      header: 'Reorder Pt',
      label: 'Reorder point',
      render: (part) => (
        <span className="text-muted-foreground">{part.reorderPoint != null ? part.reorderPoint : '—'}</span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      label: 'Description',
      render: (part) => (
        <span className="text-muted-foreground truncate max-w-[200px] inline-block">{part.description || '—'}</span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      label: 'Source',
      render: (part) => <SourceBadge source={part.source} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (part) => {
        // Command-mastered stock is read-only here — no Edit/Archive.
        const isCommandRow = connected && part.source === 'command';
        return (
          <RowActions>
            {showArchived ? (
              <>
                {checkRecordOwnership(archiveLevel, part.createdBy, user?.id) && (
                  <PermissionGuard permission={Permissions.maintenance.inventory.form.archive}>
                    <RowActionButton label="Unarchive" icon={<ArchiveRestore />} onClick={() => handleOpenArchive(part)} />
                  </PermissionGuard>
                )}
                {checkRecordOwnership(deleteLevel, part.createdBy, user?.id) && (
                  <PermissionGuard permission={Permissions.maintenance.inventory.form.delete}>
                    <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(part)} />
                  </PermissionGuard>
                )}
              </>
            ) : (
              <>
                <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => router.push(`/maintenance/inventory/${part.id}`)} />
                {!isCommandRow && (
                  <>
                    {checkRecordOwnership(editLevel, part.createdBy, user?.id) && (
                      <PermissionGuard permission={Permissions.maintenance.inventory.form.edit}>
                        <RowActionButton label="Edit" icon={<Edit />} onClick={() => handleOpenEdit(part)} />
                      </PermissionGuard>
                    )}
                    {checkRecordOwnership(archiveLevel, part.createdBy, user?.id) && (
                      <PermissionGuard permission={Permissions.maintenance.inventory.form.archive}>
                        <RowActionButton label="Archive" tone="destructive" icon={<Archive />} onClick={() => handleOpenArchive(part)} />
                      </PermissionGuard>
                    )}
                  </>
                )}
              </>
            )}
          </RowActions>
        );
      },
    },
  ];

  // Hide the Source column when standalone (every row would just read "Local").
  const columns = connected ? partColumns : partColumns.filter((c) => c.key !== 'source');

  // Filters (Category) — reuses the shared toolbar Filters control.
  const partFilterDefs: DataTableFilterDef[] = useMemo(() => {
    const categoryOptions = Object.entries(categoryMap).map(([id, name]) => ({ label: name, value: id }));
    return categoryOptions.length > 0
      ? [{ columnKey: 'categoryId', label: 'Category', type: 'select' as const, options: categoryOptions }]
      : [];
  }, [categoryMap]);

  const filteredParts = useMemo(
    () => applyTableFilters(parts, filters, partFilterDefs),
    [parts, filters, partFilterDefs],
  );

  return (
    <div className="relative flex h-full">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader title="Stock" description="Track parts, stock levels, and warehouse locations" count={pagination.total}>
          {!connected && (
            <PermissionGuard permission={Permissions.maintenance.inventory.form.create}>
              <Button onClick={handleOpenCreate}>
                <Plus className="h-4 w-4" />
                Add Stock
              </Button>
            </PermissionGuard>
          )}
        </PageHeader>

        <div className="space-y-3 px-4 pb-3 sm:px-6">
          {connected && <CommandManagedBanner />}
          <ShowArchivedToggle checked={showArchived} onCheckedChange={setShowArchived} />
        </div>

        <div className="flex-1 overflow-auto px-4 pb-6 sm:px-6">
          <DataTableToolbar
            columns={columns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
            filterDefs={partFilterDefs}
            filters={filters}
            onFilterChange={setFilter}
            onFiltersClear={clearFilters}
            afterControls={
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={selectedKeys.size === 0}
                onClick={() => setBarcodeDialogOpen(true)}
              >
                <Barcode className="h-4 w-4" />
                Generate barcode
                {selectedKeys.size > 0 && (
                  <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 text-xs rounded-full">
                    {selectedKeys.size}
                  </Badge>
                )}
              </Button>
            }
            searchNode={
              <SearchInput value={search} onChange={setSearch} placeholder="Search parts..." />
            }
          />
          <DataTable<PartRow>
            columns={columns}
            data={filteredParts}
            pagination={pagination}
            loading={loading}
            rowsPerPage={rowsPerPage}
            onPageChange={fetchParts}
            onRowsPerPageChange={setRowsPerPage}
            onRowClick={showArchived ? undefined : (part) => router.push(`/maintenance/inventory/${part.id}`)}
            rowKey={(p) => p.id}
            density={density}
            hiddenColumnKeys={hiddenColumnKeys}
            selectable
            selectedKeys={selectedKeys}
            onSelectedKeysChange={setSelectedKeys}
            emptyMessage={
              debouncedSearch
                ? 'No stock items match your search.'
                : 'No stock items yet. Click "Add Stock" to create one.'
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

      {/* Right Panel — Part Form (slide-out) */}
      <div className={cn(
        'fixed top-0 right-0 z-50 h-full w-[460px] border-l border-border bg-background transition-transform duration-300',
        panelOpen ? 'translate-x-0' : 'translate-x-full',
      )}>
        {panelOpen && (
          <PartForm mode={panelMode} part={editingPart} onClose={handleClosePanel} onSaved={handleSaved} />
        )}
      </div>


      {/* Archive Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={archivingPart?.name}
        action={showArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingPart?.name}
        onConfirm={handleDelete}
        loading={deleting}
      />

      {/* Generate Barcode Dialog */}
      <GenerateBarcodeDialog
        open={barcodeDialogOpen}
        onOpenChange={setBarcodeDialogOpen}
        items={selectedParts.map((p) => ({ id: p.id, name: p.name, code: p.partNumber }))}
      />
    </div>
  );
}

