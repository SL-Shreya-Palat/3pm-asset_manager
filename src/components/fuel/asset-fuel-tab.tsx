'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  DollarSign,
  Gauge,
  Droplets,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { FuelForm } from './fuel-form';
import type { FuelTransactionRow, Pagination, FuelAnalyticsSummary } from './types';

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
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

interface AssetFuelTabProps {
  assetId: string;
}

export function AssetFuelTab({ assetId }: AssetFuelTabProps) {
  const [transactions, setTransactions] = useState<FuelTransactionRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 10, total: 0, hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [analytics, setAnalytics] = useState<FuelAnalyticsSummary | null>(null);

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

  const fetchTransactions = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      params.set('assetId', assetId);

      const res = await axios.get(`/api/fuel?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setTransactions(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [assetId, rowsPerPage]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await axios.get(`/api/fuel/analytics?assetId=${assetId}`, { withCredentials: true });
      setAnalytics(res.data.data?.summary || null);
    } catch {
      // Non-critical
    }
  }, [assetId]);

  useEffect(() => {
    fetchTransactions(1);
  }, [fetchTransactions]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

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

  const handleOpenView = (txn: FuelTransactionRow) => {
    setViewTransaction(txn);
    setViewDialogOpen(true);
  };

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
    } catch {
      console.error('Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const columns: DataTableColumn<FuelTransactionRow>[] = [
    {
      key: 'date',
      header: 'Date',
      pinned: true,
      render: (txn) => (
        <span className="font-medium text-foreground">{formatDate(txn.date)}</span>
      ),
    },
    {
      key: 'fuelType',
      header: 'Type',
      render: (txn) => (
        <Badge variant="secondary" className="capitalize text-xs">{txn.fuelType}</Badge>
      ),
    },
    {
      key: 'volume',
      header: 'Volume (gal)',
      align: 'right',
      render: (txn) => <span className="text-muted-foreground">{formatNumber(txn.volume)}</span>,
    },
    {
      key: 'totalCost',
      header: 'Cost',
      align: 'right',
      render: (txn) => <span className="font-medium">{formatCurrency(txn.totalCost)}</span>,
    },
    {
      key: 'economy',
      header: 'MPG',
      align: 'right',
      render: (txn) => <span className="text-muted-foreground">{formatNumber(txn.economy)}</span>,
    },
    {
      key: 'station',
      header: 'Station',
      render: (txn) => <span className="text-muted-foreground">{txn.station || '—'}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (txn) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" onClick={() => handleOpenView(txn)}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => handleOpenEdit(txn)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => handleOpenDelete(txn)} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Summary cards */}
      {analytics && analytics.totalTransactions > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard icon={<DollarSign className="h-4 w-4" />} label="Total Cost" value={formatCurrency(analytics.totalCost)} />
          <SummaryCard icon={<Droplets className="h-4 w-4" />} label="Total Volume" value={`${formatNumber(analytics.totalVolume)} gal`} />
          <SummaryCard icon={<Gauge className="h-4 w-4" />} label="Avg Economy" value={analytics.avgEconomy ? `${formatNumber(analytics.avgEconomy)} MPG` : '—'} />
          <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="Avg Cost/Mile" value={analytics.avgCostPerMile ? formatCurrency(analytics.avgCostPerMile) : '—'} />
        </div>
      )}

      {/* Table header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground">
          Fuel Transactions
          <span className="text-muted-foreground font-normal ml-2">({pagination.total})</span>
        </h3>
        <Button size="sm" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4" />
          Add Transaction
        </Button>
      </div>

      <DataTable<FuelTransactionRow>
        columns={columns}
        data={transactions}
        pagination={pagination}
        loading={loading}
        rowsPerPage={rowsPerPage}
        onPageChange={fetchTransactions}
        onRowsPerPageChange={setRowsPerPage}
        onRowClick={handleOpenView}
        rowKey={(t) => t.id}
        emptyMessage="No fuel transactions for this asset yet."
      />

      {/* Slide-out panel */}
      {panelOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 transition-opacity" onClick={handleClosePanel} />
      )}
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

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
            <DialogDescription>{viewTransaction ? formatDate(viewTransaction.date) : ''}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {viewTransaction && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <ViewField label="Date" value={formatDate(viewTransaction.date)} />
                  <ViewField label="Fuel Type" value={viewTransaction.fuelType} />
                  <ViewField label="Volume" value={`${formatNumber(viewTransaction.volume)} gal`} />
                  <ViewField label="Total Cost" value={formatCurrency(viewTransaction.totalCost)} />
                  <ViewField label="Economy" value={viewTransaction.economy != null ? `${formatNumber(viewTransaction.economy)} MPG` : undefined} />
                  <ViewField label="Cost/Mile" value={formatCurrency(viewTransaction.costPerMile)} />
                  <ViewField label="Station" value={viewTransaction.station} />
                  <ViewField label="Driver" value={viewTransaction.driverName} />
                </div>
                {viewTransaction.notes && (
                  <>
                    <Separator />
                    <ViewField label="Notes" value={viewTransaction.notes} />
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setViewDialogOpen(false); if (viewTransaction) handleOpenEdit(viewTransaction); }}>
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
            <DialogTitle>Delete Fuel Transaction</DialogTitle>
            <DialogDescription>Are you sure? This action cannot be undone.</DialogDescription>
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

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-lg font-semibold text-foreground">{value}</p>
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
