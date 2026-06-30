'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  Package,
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
import { PartForm } from './part-form';
import type { PartRow, LookupOption, Pagination } from './types';

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

  // Total stock helper
  const getTotalStock = (part: PartRow): number =>
    (part.stockLocations || []).reduce((sum, s) => sum + s.quantity, 0);

  // Column definitions
  const partColumns: DataTableColumn<PartRow>[] = [
    {
      key: 'name',
      header: 'Part Name',
      label: 'Part name',
      pinned: true,
      render: (part) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Package className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground">{part.name}</span>
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
        const isLow = part.reorderPoint != null && total <= part.reorderPoint;
        return (
          <Badge variant={isLow ? 'destructive' : 'secondary'}>
            {total}
          </Badge>
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

        <div className="px-6 pb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search parts..." />
        </div>

        <div className="flex-1 overflow-auto px-6 pb-6">
          <DataTableToolbar
            columns={partColumns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
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
  const totalStock = (part.stockLocations || []).reduce((sum, s) => sum + s.quantity, 0);

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
        <h3 className="text-sm font-semibold text-foreground mb-3">Stock Management</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <ViewField label="Total Stock" value={String(totalStock)} />
            <ViewField label="Reorder Point" value={part.reorderPoint != null ? String(part.reorderPoint) : undefined} />
            <ViewField label="Max Quantity" value={part.maximumQuantity != null ? String(part.maximumQuantity) : undefined} />
          </div>
          <ViewField label="Measurement Unit" value={part.measurementUnitId ? unitMap[part.measurementUnitId] : undefined} />
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
                <span className="text-sm text-foreground">{locationMap[s.locationId] || s.locationId}</span>
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
