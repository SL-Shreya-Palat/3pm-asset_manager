'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Plus,
  Edit,
  Trash2,
  Fuel,
  Eye,
  TrendingUp,
  DollarSign,
  Gauge,
  Droplets,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';

import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/ui/search-input';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
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
import { FuelForm } from './fuel-form';
import type { FuelTransactionRow, Pagination, FuelAnalyticsSummary } from './types';

const FUEL_TYPE_FILTER: DataTableFilterDef[] = [
  {
    columnKey: 'fuelType',
    label: 'Fuel Type',
    type: 'select',
    options: [
      { label: 'Diesel', value: 'diesel' },
      { label: 'Gasoline', value: 'gasoline' },
      { label: 'Electric', value: 'electric' },
      { label: 'CNG', value: 'cng' },
      { label: 'LPG', value: 'lpg' },
      { label: 'Other', value: 'other' },
    ],
  },
];

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(value?: number) {
  if (value == null) return '—';
  return `$${value.toFixed(2)}`;
}

function formatNumber(value?: number, decimals = 2) {
  if (value == null) return '—';
  return value.toFixed(decimals);
}

export function FuelPage() {
  const [transactions, setTransactions] = useState<FuelTransactionRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [analytics, setAnalytics] = useState<FuelAnalyticsSummary | null>(null);

  // Table features
  const {
    hiddenColumnKeys, setHiddenColumnKeys,
    density, setDensity,
    filters, setFilter, clearFilters,
  } = useDataTable();

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create');
  const [editingTransaction, setEditingTransaction] = useState<FuelTransactionRow | null>(null);

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewTransaction, setViewTransaction] = useState<FuelTransactionRow | null>(null);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTransaction, setDeletingTransaction] = useState<FuelTransactionRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResultOpen, setImportResultOpen] = useState(false);
  const [importResult, setImportResult] = useState<{
    message: string;
    success: number;
    failed: number;
    total: number;
    errors: { row: number; error: string }[];
  } | null>(null);

  // ── Import handler ──
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected
    e.target.value = '';

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await axios.post('/api/fuel/import', formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data = res.data.data;
      setImportResult(data);
      setImportResultOpen(true);

      // Refresh table & analytics
      fetchTransactions(1);
      fetchAnalytics();
    } catch (err) {
      const message = axios.isAxiosError(err) && err.response?.data?.error
        ? String(err.response.data.error)
        : 'Failed to import file';
      setImportResult({ message, success: 0, failed: 0, total: 0, errors: [] });
      setImportResultOpen(true);
    } finally {
      setImporting(false);
    }
  };

  // ── Fetch transactions ──
  const fetchTransactions = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);

      const fuelTypeFilter = filters.fuelType;
      if (fuelTypeFilter && Array.isArray(fuelTypeFilter) && fuelTypeFilter.length === 1) {
        params.set('fuelType', fuelTypeFilter[0]);
      }

      const res = await axios.get(`/api/fuel?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setTransactions(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch fuel transactions:', err);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage, debouncedSearch, filters.fuelType]);

  // ── Fetch analytics ──
  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await axios.get('/api/fuel/analytics', { withCredentials: true });
      setAnalytics(res.data.data?.summary || null);
    } catch {
      // Analytics are non-critical
    }
  }, []);

  useEffect(() => {
    fetchTransactions(1);
  }, [fetchTransactions]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // ── Panel handlers ──
  const handleOpenCreate = () => {
    setEditingTransaction(null);
    setPanelMode('create');
    setPanelOpen(true);
  };

  const handleOpenEdit = (txn: FuelTransactionRow) => {
    setEditingTransaction(txn);
    setPanelMode('edit');
    setPanelOpen(true);
  };

  const handleClosePanel = () => {
    setPanelOpen(false);
    setEditingTransaction(null);
  };

  const handleSaved = () => {
    handleClosePanel();
    fetchTransactions(panelMode === 'create' ? 1 : pagination.page);
    fetchAnalytics();
  };

  // ── View dialog ──
  const handleOpenView = (txn: FuelTransactionRow) => {
    setViewTransaction(txn);
    setViewDialogOpen(true);
  };

  // ── Delete dialog ──
  const handleOpenDelete = (txn: FuelTransactionRow) => {
    setDeletingTransaction(txn);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingTransaction) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/fuel/${deletingTransaction.id}`, { withCredentials: true });
      setDeleteDialogOpen(false);
      setDeletingTransaction(null);
      fetchTransactions(pagination.page);
      fetchAnalytics();
    } catch (err) {
      console.error('Failed to delete fuel transaction:', err);
    } finally {
      setDeleting(false);
    }
  };

  // ── Column definitions ──
  const fuelColumns: DataTableColumn<FuelTransactionRow>[] = [
    {
      key: 'date',
      header: 'Date',
      label: 'Date',
      pinned: true,
      sortable: true,
      sortValue: (txn) => txn.date ? new Date(txn.date).getTime() : null,
      render: (txn) => (
        <span className="font-medium text-foreground">{formatDate(txn.date)}</span>
      ),
    },
    {
      key: 'assetName',
      header: 'Asset',
      label: 'Asset',
      pinned: true,
      sortable: true,
      render: (txn) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Fuel className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground">{txn.assetName || '—'}</span>
        </div>
      ),
    },
    {
      key: 'driverName',
      header: 'Driver',
      label: 'Driver',
      sortable: true,
      render: (txn) => (
        <span className="text-muted-foreground">{txn.driverName || '—'}</span>
      ),
    },
    {
      key: 'fuelType',
      header: 'Fuel Type',
      label: 'Fuel Type',
      sortable: true,
      render: (txn) => (
        <Badge variant="secondary" className="capitalize text-xs">
          {txn.fuelType}
        </Badge>
      ),
    },
    {
      key: 'volume',
      header: 'Volume (gal)',
      label: 'Volume',
      align: 'right',
      sortable: true,
      render: (txn) => (
        <span className="text-muted-foreground">{formatNumber(txn.volume)}</span>
      ),
    },
    {
      key: 'totalCost',
      header: 'Total Cost',
      label: 'Total Cost',
      align: 'right',
      sortable: true,
      render: (txn) => (
        <span className="font-medium text-foreground">{formatCurrency(txn.totalCost)}</span>
      ),
    },
    {
      key: 'unitCost',
      header: 'Unit Cost',
      label: 'Cost per Unit',
      align: 'right',
      render: (txn) => (
        <span className="text-muted-foreground">{formatCurrency(txn.unitCost)}</span>
      ),
    },
    {
      key: 'distance',
      header: 'Distance (mi)',
      label: 'Distance',
      align: 'right',
      render: (txn) => (
        <span className="text-muted-foreground">{formatNumber(txn.distance, 1)}</span>
      ),
    },
    {
      key: 'economy',
      header: 'MPG',
      label: 'Fuel Economy',
      align: 'right',
      render: (txn) => (
        <span className="text-muted-foreground">{formatNumber(txn.economy)}</span>
      ),
    },
    {
      key: 'costPerMile',
      header: 'Cost/Mile',
      label: 'Cost per Mile',
      align: 'right',
      render: (txn) => (
        <span className="text-muted-foreground">{formatCurrency(txn.costPerMile)}</span>
      ),
    },
    {
      key: 'station',
      header: 'Station',
      label: 'Station',
      render: (txn) => (
        <span className="text-muted-foreground">{txn.station || '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (txn) => (
        <RowActions>
          <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => handleOpenView(txn)} />
          <RowActionButton label="Edit" icon={<Edit />} onClick={() => handleOpenEdit(txn)} />
          <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(txn)} />
        </RowActions>
      ),
    },
  ];

  return (
    <div className="relative flex h-full">
      {/* Left — Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <PageHeader title="Fuel" description="Record and monitor fuel transactions across your fleet" count={pagination.total}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button variant="outline" onClick={handleImportClick} disabled={importing}>
            <Upload className="h-4 w-4" />
            {importing ? 'Importing...' : 'Import'}
          </Button>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Add Transaction
          </Button>
        </PageHeader>

        {/* Analytics summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 pb-4">
          <StatCard
            icon={<DollarSign className="h-4 w-4" />}
            label="Total Fuel Cost"
            value={formatCurrency(analytics?.totalCost)}
            loading={!analytics}
          />
          <StatCard
            icon={<Droplets className="h-4 w-4" />}
            label="Total Volume"
            value={`${formatNumber(analytics?.totalVolume)} gal`}
            loading={!analytics}
          />
          <StatCard
            icon={<Gauge className="h-4 w-4" />}
            label="Avg Economy"
            value={analytics?.avgEconomy ? `${formatNumber(analytics.avgEconomy)} MPG` : '—'}
            loading={!analytics}
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Avg Cost/Mile"
            value={analytics?.avgCostPerMile ? formatCurrency(analytics.avgCostPerMile) : '—'}
            loading={!analytics}
          />
        </div>

        {/* Toolbar + Table */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          <DataTableToolbar
            columns={fuelColumns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
            filterDefs={FUEL_TYPE_FILTER}
            filters={filters}
            onFilterChange={setFilter}
            onFiltersClear={clearFilters}
            searchNode={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search by asset, driver, station..."
              />
            }
          />
          <DataTable<FuelTransactionRow>
            columns={fuelColumns}
            data={transactions}
            pagination={pagination}
            loading={loading}
            rowsPerPage={rowsPerPage}
            onPageChange={fetchTransactions}
            onRowsPerPageChange={setRowsPerPage}
            onRowClick={handleOpenView}
            rowKey={(t) => t.id}
            density={density}
            hiddenColumnKeys={hiddenColumnKeys}
            emptyMessage={
              debouncedSearch
                ? 'No fuel transactions match your search.'
                : 'No fuel transactions yet. Click "Add Transaction" to create one.'
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

      {/* Right Panel — Fuel Form (slide-out) */}
      <div
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-[460px] border-l border-border bg-background transition-transform duration-300',
          panelOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {panelOpen && (
          <FuelForm
            mode={panelMode}
            transaction={editingTransaction}
            onClose={handleClosePanel}
            onSaved={handleSaved}
          />
        )}
      </div>

      {/* View Transaction Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Fuel Transaction Details</DialogTitle>
            <DialogDescription>
              {viewTransaction?.assetName || 'Transaction'} — {viewTransaction ? formatDate(viewTransaction.date) : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {viewTransaction && <ViewTransactionContent txn={viewTransaction} />}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setViewDialogOpen(false);
                if (viewTransaction) handleOpenEdit(viewTransaction);
              }}
            >
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Transaction Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Fuel Transaction</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this fuel transaction for &quot;{deletingTransaction?.assetName}&quot;? This action cannot be undone.
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

      {/* Import Result Dialog */}
      <Dialog open={importResultOpen} onOpenChange={setImportResultOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Import Results</DialogTitle>
            <DialogDescription>{importResult?.message}</DialogDescription>
          </DialogHeader>

          {importResult && (
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {/* Summary */}
              <div className="flex gap-4">
                <div className="flex-1 rounded-md bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-semibold text-foreground">{importResult.total}</p>
                  <p className="text-xs text-muted-foreground">Total Rows</p>
                </div>
                <div className="flex-1 rounded-md bg-green-500/10 p-3 text-center">
                  <p className="text-2xl font-semibold text-green-600">{importResult.success}</p>
                  <p className="text-xs text-muted-foreground">Imported</p>
                </div>
                {importResult.failed > 0 && (
                  <div className="flex-1 rounded-md bg-destructive/10 p-3 text-center">
                    <p className="text-2xl font-semibold text-destructive">{importResult.failed}</p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                )}
              </div>

              {/* Error list */}
              {importResult.errors.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-2">Issues</h4>
                  <div className="rounded-md border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground w-16">Row</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.errors.slice(0, 20).map((err, idx) => (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="px-3 py-2 text-muted-foreground">{err.row}</td>
                            <td className="px-3 py-2 text-destructive">{err.error}</td>
                          </tr>
                        ))}
                        {importResult.errors.length > 20 && (
                          <tr>
                            <td colSpan={2} className="px-3 py-2 text-muted-foreground text-center">
                              ...and {importResult.errors.length - 20} more
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportResultOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Read-only view of transaction details shown in the view dialog. */
function ViewTransactionContent({ txn }: { txn: FuelTransactionRow }) {
  return (
    <div className="space-y-6">
      {/* Transaction Info */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Transaction Info</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <ViewField label="Date" value={formatDate(txn.date)} />
            <ViewField label="Fuel Type" value={txn.fuelType} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ViewField label="Asset" value={txn.assetName} />
            <ViewField label="Driver" value={txn.driverName} />
          </div>
          <ViewField label="Station" value={txn.station} />
          <ViewField label="Notes" value={txn.notes} />
        </div>
      </div>

      {/* Cost & Volume */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Cost & Volume</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <ViewField label="Volume" value={`${formatNumber(txn.volume)} gal`} />
            <ViewField label="Unit Cost" value={formatCurrency(txn.unitCost)} />
            <ViewField label="Total Cost" value={formatCurrency(txn.totalCost)} />
          </div>
        </div>
      </div>

      {/* Mileage & Efficiency */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Mileage & Efficiency</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <ViewField label="Start Mileage" value={txn.startMileage != null ? formatNumber(txn.startMileage, 0) : undefined} />
            <ViewField label="End Mileage" value={txn.endMileage != null ? formatNumber(txn.endMileage, 0) : undefined} />
            <ViewField label="Distance" value={txn.distance != null ? `${formatNumber(txn.distance, 1)} mi` : undefined} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ViewField label="Fuel Economy" value={txn.economy != null ? `${formatNumber(txn.economy)} MPG` : undefined} />
            <ViewField label="Cost per Mile" value={formatCurrency(txn.costPerMile)} />
          </div>
        </div>
      </div>

      {/* Source */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Source</h3>
        <Separator className="mb-4" />
        <ViewField label="Data Source" value={txn.source} />
      </div>
    </div>
  );
}

function ViewField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground mt-0.5 capitalize">{value || '—'}</p>
    </div>
  );
}
