'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  Store,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { PageHeader } from '@/components/ui/page-header';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';
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
import { VendorForm } from './vendor-form';
import type { VendorRow, Pagination } from './types';

const VENDOR_TYPE_FILTER: DataTableFilterDef[] = [
  {
    columnKey: 'vendorType',
    label: 'Vendor Type',
    type: 'select',
    options: [
      { label: 'Parts', value: 'parts' },
      { label: 'Services', value: 'services' },
    ],
  },
];

export function VendorsPage() {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
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
    filters, setFilter, clearFilters,
  } = useDataTable();

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create');
  const [editingVendor, setEditingVendor] = useState<VendorRow | null>(null);

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewVendor, setViewVendor] = useState<VendorRow | null>(null);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingVendor, setDeletingVendor] = useState<VendorRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch vendors ──
  const fetchVendors = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);

      // Apply vendor type filter from toolbar
      const vendorTypeFilter = filters.vendorType;
      if (vendorTypeFilter && Array.isArray(vendorTypeFilter) && vendorTypeFilter.length === 1) {
        params.set('vendorType', vendorTypeFilter[0]);
      }

      const res = await axios.get(`/api/vendors?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setVendors(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch vendors:', err);
      setVendors([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage, debouncedSearch, filters.vendorType]);

  useEffect(() => {
    fetchVendors(1);
  }, [fetchVendors]);

  // ── Panel handlers ──
  const handleOpenCreate = () => {
    setEditingVendor(null);
    setPanelMode('create');
    setPanelOpen(true);
  };

  const handleOpenEdit = (vendor: VendorRow) => {
    setEditingVendor(vendor);
    setPanelMode('edit');
    setPanelOpen(true);
  };

  const handleClosePanel = () => {
    setPanelOpen(false);
    setEditingVendor(null);
  };

  const handleSaved = () => {
    handleClosePanel();
    fetchVendors(panelMode === 'create' ? 1 : pagination.page);
  };

  // ── View dialog ──
  const handleOpenView = (vendor: VendorRow) => {
    setViewVendor(vendor);
    setViewDialogOpen(true);
  };

  // ── Delete dialog ──
  const handleOpenDelete = (vendor: VendorRow) => {
    setDeletingVendor(vendor);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingVendor) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/vendors/${deletingVendor.id}`, { withCredentials: true });
      setDeleteDialogOpen(false);
      setDeletingVendor(null);
      fetchVendors(pagination.page);
    } catch (err) {
      console.error('Failed to delete vendor:', err);
    } finally {
      setDeleting(false);
    }
  };

  // ── Column definitions ──
  const vendorColumns: DataTableColumn<VendorRow>[] = [
    {
      key: 'name',
      header: 'Vendor',
      label: 'Vendor Name',
      pinned: true,
      sortable: true,
      render: (vendor) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Store className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground">{vendor.name}</span>
        </div>
      ),
    },
    {
      key: 'contactName',
      header: 'Contact',
      label: 'Contact Name',
      pinned: true,
      sortable: true,
      render: (vendor) => (
        <span className="text-muted-foreground">{vendor.contactName || '—'}</span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      label: 'Email',
      sortable: true,
      render: (vendor) => (
        <span className="text-muted-foreground">{vendor.email || '—'}</span>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      label: 'Phone',
      render: (vendor) => (
        <span className="text-muted-foreground">{vendor.phone || '—'}</span>
      ),
    },
    {
      key: 'address',
      header: 'Address',
      label: 'Address',
      render: (vendor) => (
        <span className="text-muted-foreground">{vendor.address || '—'}</span>
      ),
    },
    {
      key: 'website',
      header: 'Website',
      label: 'Website',
      render: (vendor) => (
        <span className="text-muted-foreground">{vendor.website || '—'}</span>
      ),
    },
    {
      key: 'vendorTypes',
      header: 'Type',
      label: 'Vendor Type',
      render: (vendor) => (
        <div className="flex items-center gap-1">
          {vendor.vendorTypes.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            vendor.vendorTypes.map((t) => (
              <Badge key={t} variant="secondary" className="capitalize text-xs">
                {t}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      key: 'publicEditAccess',
      header: 'Public Access',
      label: 'Public edit access',
      render: (vendor) => (
        <Badge variant={vendor.publicEditAccess ? 'success' : 'secondary'} className="text-xs">
          {vendor.publicEditAccess ? 'Enabled' : 'Disabled'}
        </Badge>
      ),
    },
    {
      key: 'laborRatePerHour',
      header: 'Labor Rate',
      label: 'Rate per hour ($)',
      sortable: true,
      render: (vendor) => (
        <span className="text-muted-foreground">
          {vendor.laborRatePerHour != null ? `$${vendor.laborRatePerHour.toFixed(2)}` : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (vendor) => (
        <RowActions>
          <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => handleOpenView(vendor)} />
          <RowActionButton label="Edit" icon={<Pencil />} onClick={() => handleOpenEdit(vendor)} />
          <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(vendor)} />
        </RowActions>
      ),
    },
  ];

  return (
    <div className="relative flex h-full">
      {/* Left — Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <PageHeader title="Vendors" count={pagination.total}>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Add Vendor
          </Button>
        </PageHeader>

        {/* Toolbar + Table */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          <DataTableToolbar
            columns={vendorColumns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
            filterDefs={VENDOR_TYPE_FILTER}
            filters={filters}
            onFilterChange={setFilter}
            onFiltersClear={clearFilters}
            searchNode={
              <SearchInput value={search} onChange={setSearch} placeholder="Search vendors..." />
            }
          />
          <DataTable<VendorRow>
            columns={vendorColumns}
            data={vendors}
            pagination={pagination}
            loading={loading}
            rowsPerPage={rowsPerPage}
            onPageChange={fetchVendors}
            onRowsPerPageChange={setRowsPerPage}
            onRowClick={handleOpenView}
            rowKey={(v) => v.id}
            density={density}
            hiddenColumnKeys={hiddenColumnKeys}
            emptyMessage={
              debouncedSearch
                ? 'No vendors match your search.'
                : 'No vendors yet. Click "Add Vendor" to create one.'
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

      {/* Right Panel — Vendor Form (slide-out) */}
      <div
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-[460px] border-l border-border bg-background transition-transform duration-300',
          panelOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {panelOpen && (
          <VendorForm
            mode={panelMode}
            vendor={editingVendor}
            onClose={handleClosePanel}
            onSaved={handleSaved}
          />
        )}
      </div>

      {/* View Vendor Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewVendor?.name || 'Vendor Details'}</DialogTitle>
            <DialogDescription>Vendor information overview.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {viewVendor && <ViewVendorContent vendor={viewVendor} />}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setViewDialogOpen(false);
                if (viewVendor) handleOpenEdit(viewVendor);
              }}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Vendor Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Vendor</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingVendor?.name}&quot;? This action cannot be undone.
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

/** Read-only view of vendor details shown in the view dialog. */
function ViewVendorContent({ vendor }: { vendor: VendorRow }) {
  return (
    <div className="space-y-6">
      {/* Vendor Details */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Vendor Details</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <ViewField label="Vendor Name" value={vendor.name} />
          <ViewField label="Address" value={vendor.address} />
          <ViewField label="Website" value={vendor.website} />
        </div>
      </div>

      {/* Primary Contact */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Primary Contact</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <ViewField label="Name" value={vendor.contactName} />
          <div className="grid grid-cols-2 gap-4">
            <ViewField label="Phone" value={vendor.phone} />
            <ViewField label="Email" value={vendor.email} />
          </div>
        </div>
      </div>

      {/* Vendor Type & Access */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Vendor Type & Access</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Vendor Type</p>
            <div className="flex items-center gap-1 mt-1">
              {vendor.vendorTypes.length === 0 ? (
                <span className="text-sm text-foreground">—</span>
              ) : (
                vendor.vendorTypes.map((t) => (
                  <Badge key={t} variant="secondary" className="capitalize">
                    {t}
                  </Badge>
                ))
              )}
            </div>
          </div>
          <ViewField
            label="Public Edit Access"
            value={vendor.publicEditAccess ? 'Enabled' : 'Disabled'}
          />
        </div>
      </div>

      {/* Labor Rate */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Labor Rate</h3>
        <Separator className="mb-4" />
        <ViewField
          label="Rate per hour"
          value={vendor.laborRatePerHour != null ? `$${vendor.laborRatePerHour.toFixed(2)}` : undefined}
        />
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
