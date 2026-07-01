'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Plus,
  Pencil,
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

export function InventoryPage() {
  const [parts, setParts] = useState<PartRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Lookup maps
  const [manufacturerMap, setManufacturerMap] = useState<Record<string, string>>({});
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [unitMap, setUnitMap] = useState<Record<string, string>>({});
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});
  const [vendorMap, setVendorMap] = useState<Record<string, string>>({});

  // Table features
  const {
    hiddenColumnKeys, setHiddenColumnKeys,
    density, setDensity,
  } = useDataTable();

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create');
  const [editingPart, setEditingPart] = useState<PartRow | null>(null);

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewPart, setViewPart] = useState<PartRow | null>(null);

  // Delete dialog
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
      const [mfRes, catRes, muRes, locRes, venRes] = await Promise.all([
        axios.get('/api/inventory-settings/part-manufacturers', { withCredentials: true }),
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
      setManufacturerMap(toMap(mfRes.data.data || []));
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
  }, [rowsPerPage, debouncedSearch]);

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

  // View dialog
  const handleOpenView = (part: PartRow) => { setViewPart(part); setViewDialogOpen(true); };

  // Delete
  const handleOpenDelete = (part: PartRow) => { setDeletingPart(part); setDeleteDialogOpen(true); };
  const handleDelete = async () => {
    if (!deletingPart) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/parts/${deletingPart.id}`, { withCredentials: true });
      setDeleteDialogOpen(false); setDeletingPart(null);
      fetchParts(pagination.page);
    } catch { /* silent */ } finally { setDeleting(false); }
  };

  // Column definitions
  const partColumns: DataTableColumn<PartRow>[] = [
    {
      key: 'name',
      header: 'Part Name',
      label: 'Part name',
      pinned: true,
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
      header: 'Part #',
      label: 'Part number',
      pinned: true,
      render: (part) => (
        <span className="text-muted-foreground font-mono text-xs">{part.partNumber}</span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      label: 'Category',
      render: (part) => (
        <span className="text-muted-foreground">{part.categoryId ? categoryMap[part.categoryId] || '—' : '—'}</span>
      ),
    },
    {
      key: 'manufacturer',
      header: 'Manufacturer',
      label: 'Manufacturer',
      render: (part) => (
        <span className="text-muted-foreground">{part.manufacturerId ? manufacturerMap[part.manufacturerId] || '—' : '—'}</span>
      ),
    },
    {
      key: 'totalStock',
      header: 'Stock',
      label: 'Total stock',
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
      key: 'upc',
      header: 'UPC',
      label: 'UPC',
      render: (part) => (
        <span className="text-muted-foreground font-mono text-xs">{part.upc || '—'}</span>
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
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (part) => (
        <RowActions>
          <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => handleOpenView(part)} />
          <RowActionButton label="Edit" icon={<Pencil />} onClick={() => handleOpenEdit(part)} />
          <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(part)} />
        </RowActions>
      ),
    },
  ];

  return (
    <div className="relative flex h-full">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader title="Inventory" count={pagination.total}>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Add Part
          </Button>
        </PageHeader>

        <div className="flex-1 overflow-auto px-6 pb-6">
          <DataTableToolbar
            columns={partColumns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
            actions={
              selectedKeys.size > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setBarcodeDialogOpen(true)}
                >
                  <Barcode className="h-4 w-4" />
                  Generate barcode
                  <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 text-xs rounded-full">
                    {selectedKeys.size}
                  </Badge>
                </Button>
              ) : null
            }
            searchNode={
              <SearchInput value={search} onChange={setSearch} placeholder="Search parts..." className="max-w-sm w-full" />
            }
          />
          <DataTable<PartRow>
            columns={partColumns}
            data={parts}
            pagination={pagination}
            loading={loading}
            rowsPerPage={rowsPerPage}
            onPageChange={fetchParts}
            onRowsPerPageChange={setRowsPerPage}
            onRowClick={handleOpenView}
            rowKey={(p) => p.id}
            density={density}
            hiddenColumnKeys={hiddenColumnKeys}
            selectable
            selectedKeys={selectedKeys}
            onSelectedKeysChange={setSelectedKeys}
            emptyMessage={
              debouncedSearch
                ? 'No parts match your search.'
                : 'No parts yet. Click "Add Part" to create one.'
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

      {/* View Part Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewPart?.name || 'Part Details'}</DialogTitle>
            <DialogDescription>Inventory part overview.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {viewPart && (
              <ViewPartContent
                part={viewPart}
                manufacturerMap={manufacturerMap}
                categoryMap={categoryMap}
                unitMap={unitMap}
                locationMap={locationMap}
                vendorMap={vendorMap}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setViewDialogOpen(false); if (viewPart) handleOpenEdit(viewPart); }}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Part</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingPart?.name}&quot;? This action cannot be undone.
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

      {/* Generate Barcode Dialog */}
      <GenerateBarcodeDialog
        open={barcodeDialogOpen}
        onOpenChange={setBarcodeDialogOpen}
        items={selectedParts.map((p) => ({ id: p.id, name: p.name, code: p.partNumber }))}
      />
    </div>
  );
}

/** Read-only view of part details. */
function ViewPartContent({
  part,
  manufacturerMap,
  categoryMap,
  unitMap,
  locationMap,
  vendorMap,
}: {
  part: PartRow;
  manufacturerMap: Record<string, string>;
  categoryMap: Record<string, string>;
  unitMap: Record<string, string>;
  locationMap: Record<string, string>;
  vendorMap: Record<string, string>;
}) {
  const totalStock = getTotalStock(part);
  const status = getStockStatus(part, totalStock);
  const unitPrice = getUnitPrice(part);
  const stockValue = totalStock * unitPrice;

  return (
    <div className="space-y-6">
      {/* Details */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Part Details</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <ViewField label="Part Name" value={part.name} />
          <div className="grid grid-cols-2 gap-4">
            <ViewField label="Part Number" value={part.partNumber} />
            <ViewField label="UPC" value={part.upc} />
          </div>
          <ViewField label="Manufacturer" value={part.manufacturerId ? manufacturerMap[part.manufacturerId] : undefined} />
          <ViewField label="Category" value={part.categoryId ? categoryMap[part.categoryId] : undefined} />
          <ViewField label="Description" value={part.description} />
        </div>
      </div>

      {/* Stock */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">Stock Management</h3>
          <Badge variant={status.variant}>{status.label}</Badge>
          {isUnpriced(part) && <Badge variant="warning">Unpriced</Badge>}
        </div>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <ViewField label="Total Stock" value={String(totalStock)} />
            <ViewField label="Reorder Point" value={part.reorderPoint != null ? String(part.reorderPoint) : undefined} />
            <ViewField label="Max Quantity" value={part.maximumQuantity != null ? String(part.maximumQuantity) : undefined} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <ViewField label="Measurement Unit" value={part.measurementUnitId ? unitMap[part.measurementUnitId] : undefined} />
            <ViewField label="Unit Price" value={unitPrice > 0 ? `$${unitPrice.toFixed(2)}` : undefined} />
            <ViewField label="Stock Value" value={unitPrice > 0 ? `$${stockValue.toFixed(2)}` : undefined} />
          </div>
        </div>
      </div>

      {/* Vendors */}
      {part.vendors.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Vendors</h3>
          <Separator className="mb-4" />
          <div className="space-y-2">
            {part.vendors.map((v, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="text-sm text-foreground">{vendorMap[v.vendorId] || v.vendorId}</span>
                <span className="text-sm text-muted-foreground">${v.unitCost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locations */}
      {part.stockLocations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Locations</h3>
          <Separator className="mb-4" />
          <div className="space-y-2">
            {part.stockLocations.map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="text-sm text-foreground">{(s.locationId && locationMap[s.locationId]) || 'Unassigned'}</span>
                <Badge variant="secondary">{s.quantity}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
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
