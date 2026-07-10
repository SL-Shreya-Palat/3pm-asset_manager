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
import { ShowArchivedToggle } from '@/components/ui/show-archived-toggle';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { cn } from '@/lib/utils';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import { useConnection } from '@/hooks/use-connection';
import { SourceBadge, CommandManagedBanner } from '@/components/command/source-badge';
import { VendorForm } from './vendor-form';
import type { VendorRow, Pagination } from './types';
import { VENDOR_TYPE_LABELS, vendorTypeLabel, vendorWebsiteHref } from './types';

const VENDOR_TYPE_FILTER: DataTableFilterDef[] = [
  {
    columnKey: 'vendorType',
    label: 'Vendor Type',
    type: 'select',
    options: [
      { label: VENDOR_TYPE_LABELS.parts, value: 'parts' },
      { label: VENDOR_TYPE_LABELS.services, value: 'services' },
    ],
  },
];

export function VendorsPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Connected to Command → vendors are mastered there (read-only, auto-synced).
  const { connected } = useConnection();

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

  // Archive state
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingVendor, setArchivingVendor] = useState<VendorRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Delete state
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
      if (showArchived) params.set('showArchived', 'true');

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
  }, [rowsPerPage, debouncedSearch, filters.vendorType, showArchived]);

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

  // Archive handlers
  const handleOpenArchive = (vendor: VendorRow) => {
    setArchivingVendor(vendor);
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    if (!archivingVendor) return;
    setArchiving(true);
    try {
      const archived = !showArchived; // If viewing active items, we archive. If viewing archived, we unarchive.
      await axios.patch(`/api/vendors/${archivingVendor.id}/archive`, { archived }, { withCredentials: true });
      setArchiveDialogOpen(false);
      setArchivingVendor(null);
      fetchVendors(pagination.page);
    } catch (err) {
      console.error('Failed to archive/unarchive vendor:', err);
    } finally {
      setArchiving(false);
    }
  };

  // Delete handlers
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
      render: (vendor) =>
        vendor.website ? (
          <a
            href={vendorWebsiteHref(vendor.website)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-600 hover:underline"
          >
            {vendor.website}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'vendorTypes',
      header: 'Vendor Type',
      label: 'Vendor Type',
      render: (vendor) => (
        <div className="flex items-center gap-1">
          {vendor.vendorTypes.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            vendor.vendorTypes.map((t) => (
              <Badge key={t} variant="secondary" className="capitalize text-xs">
                {vendorTypeLabel(t)}
              </Badge>
            ))
          )}
        </div>
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
      key: 'source',
      header: 'Source',
      label: 'Source',
      render: (vendor) => <SourceBadge source={vendor.source} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (vendor) => {
        // Command-mastered vendors are read-only here — only View.
        const isCommandRow = connected && vendor.source === 'command';
        return (
          <RowActions>
            {!showArchived && (
              <>
                <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => router.push(`/vendors/${vendor.id}`)} />
                {!isCommandRow && (
                  <>
                    <RowActionButton label="Edit" icon={<Edit />} onClick={() => handleOpenEdit(vendor)} />
                    <RowActionButton label="Archive" icon={<Archive />} onClick={() => handleOpenArchive(vendor)} />
                  </>
                )}
              </>
            )}
            {showArchived && (
              <>
                <RowActionButton label="Unarchive" icon={<ArchiveRestore />} onClick={() => handleOpenArchive(vendor)} />
                <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(vendor)} />
              </>
            )}
          </RowActions>
        );
      },
    },
  ];

  // Hide the Source column when standalone (every row would just read "Local").
  const columns = connected ? vendorColumns : vendorColumns.filter((c) => c.key !== 'source');

  return (
    <div className="relative flex h-full">
      {/* Left — Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <PageHeader title="Vendors" description="Manage suppliers and service providers for your operations" count={pagination.total}>
          {!connected && (
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" />
              Add Vendor
            </Button>
          )}
        </PageHeader>

        {connected && (
          <div className="px-4 pb-3 sm:px-6">
            <CommandManagedBanner />
          </div>
        )}

        {/* Toolbar + Table */}
        <div className="flex-1 overflow-auto px-4 pb-6 sm:px-6">
          <DataTableToolbar
            columns={columns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
            filterDefs={VENDOR_TYPE_FILTER}
            filters={filters}
            onFilterChange={setFilter}
            onFiltersClear={clearFilters}
            afterControls={
              <ShowArchivedToggle checked={showArchived} onCheckedChange={setShowArchived} />
            }
            searchNode={
              <SearchInput value={search} onChange={setSearch} placeholder="Search vendors..." />
            }
          />
          <DataTable<VendorRow>
            columns={columns}
            data={vendors}
            pagination={pagination}
            loading={loading}
            rowsPerPage={rowsPerPage}
            onPageChange={fetchVendors}
            onRowsPerPageChange={setRowsPerPage}
            onRowClick={showArchived ? undefined : (vendor) => router.push(`/vendors/${vendor.id}`)}
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

      {/* Archive Vendor Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={archivingVendor?.name}
        action={showArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Delete Vendor Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingVendor?.name}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

