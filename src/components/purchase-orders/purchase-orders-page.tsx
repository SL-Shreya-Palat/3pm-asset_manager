'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  ShoppingCart,
  PackageCheck,
  Send,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchInput } from '@/components/ui/search-input';
import { PageHeader } from '@/components/ui/page-header';
import { FilterTabs } from '@/components/ui/filter-tabs';
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
import { PurchaseOrderForm } from './purchase-order-form';
import type {
  PurchaseOrderRow,
  LookupOption,
  Pagination,
} from './types';
import {
  PO_STATUS_TABS,
  STATUS_BADGE_VARIANT,
  STATUS_DISPLAY_NAME,
} from './types';

type POActionKind = 'transition' | 'receive' | 'reject';
interface POAction {
  targetStatus: string;
  label: string;
  kind: POActionKind;
}

/** Next actions for a PO given its status. Receiving and rejection open dedicated
 *  dialogs; everything else is a plain status transition. */
function getStatusActions(status: string): POAction[] {
  switch (status) {
    case 'draft':
      return [{ targetStatus: 'pending_approval', label: 'Submit for Approval', kind: 'transition' }];
    case 'pending_approval':
      return [
        { targetStatus: 'approved', label: 'Approve', kind: 'transition' },
        { targetStatus: 'rejected', label: 'Reject', kind: 'reject' },
      ];
    case 'rejected':
      return [{ targetStatus: 'pending_approval', label: 'Resubmit', kind: 'transition' }];
    case 'approved':
      return [
        { targetStatus: 'purchased', label: 'Mark as Purchased', kind: 'transition' },
        { targetStatus: 'closed', label: 'Close', kind: 'transition' },
      ];
    case 'purchased':
      return [{ targetStatus: 'received', label: 'Receive Items', kind: 'receive' }];
    case 'received_partial':
      return [
        { targetStatus: 'received', label: 'Receive Items', kind: 'receive' },
        { targetStatus: 'closed', label: 'Close', kind: 'transition' },
      ];
    case 'received':
      return [{ targetStatus: 'closed', label: 'Close', kind: 'transition' }];
    default:
      return [];
  }
}

/** A line prepared for the receive dialog. */
interface ReceiveLine {
  index: number;
  partId: string;
  ordered: number;
  received: number;
  receiveNow: string;
}

export function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [activeTab, setActiveTab] = useState('all');

  // Lookup maps
  const [vendorMap, setVendorMap] = useState<Record<string, string>>({});
  const [partMap, setPartMap] = useState<Record<string, string>>({});
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});
  const [userMap, setUserMap] = useState<Record<string, string>>({});

  // Table features
  const {
    hiddenColumnKeys, setHiddenColumnKeys,
    density, setDensity,
  } = useDataTable();

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create');
  const [editingOrder, setEditingOrder] = useState<PurchaseOrderRow | null>(null);

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewOrder, setViewOrder] = useState<PurchaseOrderRow | null>(null);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<PurchaseOrderRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Status transitions (submit / approve / purchase / close)
  const [transitioning, setTransitioning] = useState(false);
  const [actionError, setActionError] = useState('');

  // Reject dialog
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectOrder, setRejectOrder] = useState<PurchaseOrderRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Receive dialog
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrderRow | null>(null);
  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([]);
  const [receiving, setReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState('');

  // Fetch lookup data
  const fetchLookups = useCallback(async () => {
    try {
      const [venRes, partsRes, locRes, usersRes] = await Promise.all([
        axios.get('/api/vendors?limit=100', { withCredentials: true }),
        axios.get('/api/parts?limit=100', { withCredentials: true }),
        axios.get('/api/inventory-settings/part-locations', { withCredentials: true }),
        axios.get('/api/users?limit=100', { withCredentials: true }),
      ]);
      const toMap = (items: LookupOption[]) => {
        const map: Record<string, string> = {};
        items.forEach((i) => { map[i.id] = i.name; });
        return map;
      };
      const vendorItems = venRes.data.data?.items || venRes.data.data || [];
      setVendorMap(toMap(vendorItems.map((i: Record<string, unknown>) => ({ id: i.id as string, name: i.name as string }))));
      const partItems = partsRes.data.data?.items || partsRes.data.data || [];
      setPartMap(toMap(partItems.map((i: Record<string, unknown>) => ({ id: i.id as string, name: i.name as string }))));
      const locItems = locRes.data.data || [];
      setLocationMap(toMap(locItems.map((i: Record<string, unknown>) => ({ id: i.id as string, name: i.name as string }))));
      const userItems = usersRes.data.data?.items || usersRes.data.data || [];
      setUserMap(toMap(userItems.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        name: (i.name as string) || `${(i.firstName as string) || ''} ${(i.lastName as string) || ''}`.trim() || (i.email as string) || '',
      }))));
    } catch {
      // Silent
    }
  }, []);

  // Fetch purchase orders
  const fetchOrders = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (activeTab !== 'all') params.set('status', activeTab);

      const res = await axios.get(`/api/purchase-orders?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setOrders(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch purchase orders:', err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage, debouncedSearch, activeTab]);

  useEffect(() => { fetchLookups(); }, [fetchLookups]);
  useEffect(() => { fetchOrders(1); }, [fetchOrders]);

  // Panel handlers
  const handleOpenCreate = () => { setEditingOrder(null); setPanelMode('create'); setPanelOpen(true); };
  const handleOpenEdit = (order: PurchaseOrderRow) => { setEditingOrder(order); setPanelMode('edit'); setPanelOpen(true); };
  const handleClosePanel = () => { setPanelOpen(false); setEditingOrder(null); };
  const handleSaved = () => {
    handleClosePanel();
    fetchOrders(panelMode === 'create' ? 1 : pagination.page);
  };

  // View dialog
  const handleOpenView = (order: PurchaseOrderRow) => { setViewOrder(order); setActionError(''); setViewDialogOpen(true); };

  // Delete
  const handleOpenDelete = (order: PurchaseOrderRow) => { setDeletingOrder(order); setDeleteDialogOpen(true); };
  const handleDelete = async () => {
    if (!deletingOrder) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/purchase-orders/${deletingOrder.id}`, { withCredentials: true });
      setDeleteDialogOpen(false); setDeletingOrder(null);
      fetchOrders(pagination.page);
    } catch { /* silent */ } finally { setDeleting(false); }
  };

  // ── Status actions ──
  const handleAction = (order: PurchaseOrderRow, action: POAction) => {
    if (action.kind === 'receive') return handleOpenReceive(order);
    if (action.kind === 'reject') { setRejectOrder(order); setRejectReason(''); setRejectOpen(true); return; }
    handleTransition(order, action.targetStatus);
  };

  const handleTransition = async (order: PurchaseOrderRow, status: string, note?: string): Promise<boolean> => {
    setTransitioning(true);
    setActionError('');
    try {
      const res = await axios.put(
        `/api/purchase-orders/${order.id}/status`,
        { status, note },
        { withCredentials: true },
      );
      if (res.data?.data) setViewOrder(res.data.data as PurchaseOrderRow);
      fetchOrders(pagination.page);
      return true;
    } catch (err) {
      setActionError(
        axios.isAxiosError(err) && err.response?.data?.error
          ? String(err.response.data.error)
          : 'Action failed',
      );
      return false;
    } finally { setTransitioning(false); }
  };

  const handleSubmitReject = async () => {
    if (!rejectOrder || !rejectReason.trim()) return;
    setRejecting(true);
    try {
      const ok = await handleTransition(rejectOrder, 'rejected', rejectReason.trim());
      if (ok) { setRejectOpen(false); setRejectOrder(null); setRejectReason(''); }
    } finally { setRejecting(false); }
  };

  // ── Receiving ──
  const handleOpenReceive = (order: PurchaseOrderRow) => {
    setReceiveError('');
    setReceiveOrder(order);
    setReceiveLines(
      order.lineItems.map((li, index) => {
        const received = li.receivedQuantity ?? 0;
        const outstanding = Math.max(0, li.quantity - received);
        return {
          index,
          partId: li.partId,
          ordered: li.quantity,
          received,
          receiveNow: String(outstanding), // default to everything still outstanding
        };
      }),
    );
    setReceiveOpen(true);
  };

  const updateReceiveLine = (index: number, value: string) => {
    setReceiveLines((prev) => prev.map((l) => (l.index === index ? { ...l, receiveNow: value } : l)));
  };

  const handleSubmitReceive = async () => {
    if (!receiveOrder) return;
    setReceiveError('');

    // Build receipts from lines with a positive, in-range quantity.
    const receipts: Array<{ index: number; quantity: number }> = [];
    for (const l of receiveLines) {
      const outstanding = Math.max(0, l.ordered - l.received);
      const qty = Math.floor(Number(l.receiveNow));
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (qty > outstanding) {
        setReceiveError(`Cannot receive more than the ${outstanding} outstanding for ${partMap[l.partId] || 'a part'}.`);
        return;
      }
      receipts.push({ index: l.index, quantity: qty });
    }
    if (receipts.length === 0) {
      setReceiveError('Enter at least one quantity to receive.');
      return;
    }

    setReceiving(true);
    try {
      const res = await axios.post(
        `/api/purchase-orders/${receiveOrder.id}/receive`,
        { receipts },
        { withCredentials: true },
      );
      if (res.data?.data) setViewOrder(res.data.data as PurchaseOrderRow);
      setReceiveOpen(false); setReceiveOrder(null);
      fetchOrders(pagination.page);
    } catch (err) {
      setReceiveError(
        axios.isAxiosError(err) && err.response?.data?.error
          ? String(err.response.data.error)
          : 'Failed to receive items',
      );
    } finally { setReceiving(false); }
  };

  // Column definitions
  const poColumns: DataTableColumn<PurchaseOrderRow>[] = [
    {
      key: 'poNumber',
      header: 'PO #',
      label: 'PO number',
      pinned: true,
      render: (order) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground font-mono text-sm">{order.poNumber}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      label: 'Status',
      pinned: true,
      render: (order) => (
        <Badge variant={STATUS_BADGE_VARIANT[order.status] || 'secondary'}>
          {STATUS_DISPLAY_NAME[order.status] || order.status}
        </Badge>
      ),
    },
    {
      key: 'vendorName',
      header: 'Vendor',
      label: 'Vendor',
      render: (order) => (
        <span className="text-foreground">{order.vendorName || '—'}</span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      label: 'Total',
      render: (order) => (
        <span className="text-foreground font-medium">${order.total.toFixed(2)}</span>
      ),
    },
    {
      key: 'lineItemCount',
      header: 'Items',
      label: 'Items count',
      render: (order) => (
        <span className="text-muted-foreground">{order.lineItems.length}</span>
      ),
    },
    {
      key: 'approver',
      header: 'Approver',
      label: 'Approver',
      render: (order) => (
        <span className="text-muted-foreground">{userMap[order.approverId] || '—'}</span>
      ),
    },
    {
      key: 'deliveryLocation',
      header: 'Delivery Location',
      label: 'Delivery location',
      render: (order) => (
        <span className="text-muted-foreground">{locationMap[order.deliveryLocationId] || '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      label: 'Created',
      render: (order) => (
        <span className="text-muted-foreground text-xs">
          {new Date(order.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (order) => (
        <RowActions>
          <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => handleOpenView(order)} />
          {['purchased', 'received_partial'].includes(order.status) && (
            <RowActionButton label="Receive" tone="primary" icon={<PackageCheck />} onClick={() => handleOpenReceive(order)} />
          )}
          {['draft', 'rejected'].includes(order.status) && (
            <RowActionButton label="Edit" icon={<Pencil />} onClick={() => handleOpenEdit(order)} />
          )}
          {order.status === 'draft' && (
            <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(order)} />
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="relative flex h-full">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader title="Purchase Orders" count={pagination.total}>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Create PO
          </Button>
        </PageHeader>

        {/* Status Tabs */}
        <div className="px-6 pb-4">
          <FilterTabs
            value={activeTab}
            onChange={setActiveTab}
            tabs={PO_STATUS_TABS.map((t) => ({ value: t.key, label: t.label }))}
          />
        </div>

        <div className="flex-1 overflow-auto px-6 pb-6">
          <DataTableToolbar
            columns={poColumns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
            searchNode={
              <SearchInput value={search} onChange={setSearch} placeholder="Search purchase orders..." className="max-w-sm w-full" />
            }
          />
          <DataTable<PurchaseOrderRow>
            columns={poColumns}
            data={orders}
            pagination={pagination}
            loading={loading}
            rowsPerPage={rowsPerPage}
            onPageChange={fetchOrders}
            onRowsPerPageChange={setRowsPerPage}
            onRowClick={handleOpenView}
            rowKey={(o) => o.id}
            density={density}
            hiddenColumnKeys={hiddenColumnKeys}
            emptyMessage={
              debouncedSearch
                ? 'No purchase orders match your search.'
                : activeTab !== 'all'
                  ? `No ${STATUS_DISPLAY_NAME[activeTab] || activeTab} purchase orders.`
                  : 'No purchase orders yet. Click "Create PO" to create one.'
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

      {/* Right Panel — PO Form (slide-out) */}
      <div className={cn(
        'fixed top-0 right-0 z-50 h-full w-[560px] border-l border-border bg-background transition-transform duration-300',
        panelOpen ? 'translate-x-0' : 'translate-x-full',
      )}>
        {panelOpen && (
          <PurchaseOrderForm
            mode={panelMode}
            purchaseOrder={editingOrder}
            onClose={handleClosePanel}
            onSaved={handleSaved}
          />
        )}
      </div>

      {/* View PO Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewOrder?.poNumber || 'Purchase Order Details'}</DialogTitle>
            <DialogDescription>Purchase order overview.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {viewOrder && (
              <ViewPOContent
                order={viewOrder}
                vendorMap={vendorMap}
                partMap={partMap}
                locationMap={locationMap}
                userMap={userMap}
              />
            )}
          </div>
          {actionError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{actionError}</p>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {viewOrder && ['draft', 'rejected'].includes(viewOrder.status) && (
              <Button variant="outline" onClick={() => { setViewDialogOpen(false); if (viewOrder) handleOpenEdit(viewOrder); }}>
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
            )}
            {viewOrder && getStatusActions(viewOrder.status).map((action) => {
              const isPrimary = action.kind === 'receive' || action.targetStatus === 'approved' || action.targetStatus === 'pending_approval' || action.targetStatus === 'purchased';
              const icon =
                action.kind === 'receive' ? <PackageCheck className="h-4 w-4 mr-1" />
                : action.kind === 'reject' ? <X className="h-4 w-4 mr-1" />
                : action.targetStatus === 'approved' ? <Check className="h-4 w-4 mr-1" />
                : action.targetStatus === 'purchased' ? <ShoppingCart className="h-4 w-4 mr-1" />
                : action.targetStatus === 'closed' ? null
                : <Send className="h-4 w-4 mr-1" />;
              return (
                <Button
                  key={action.targetStatus}
                  variant={isPrimary ? 'default' : 'outline'}
                  disabled={transitioning}
                  onClick={() => viewOrder && handleAction(viewOrder, action)}
                >
                  {icon}{action.label}
                </Button>
              );
            })}
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Purchase Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingOrder?.poNumber}&quot;? This action cannot be undone.
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

      {/* Receive Items Dialog */}
      <Dialog open={receiveOpen} onOpenChange={(o) => { if (!o) { setReceiveOpen(false); setReceiveOrder(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Receive Items — {receiveOrder?.poNumber}</DialogTitle>
            <DialogDescription>
              Enter how many of each item arrived. Received quantities are added to stock at the delivery location
              {receiveOrder ? ` (${locationMap[receiveOrder.deliveryLocationId] || 'delivery location'})` : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-2">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-1 text-xs font-medium text-muted-foreground">
              <span>Part</span>
              <span className="w-16 text-right">Ordered</span>
              <span className="w-16 text-right">Received</span>
              <span className="w-24 text-right">Receive now</span>
            </div>
            <div className="space-y-2">
              {receiveLines.map((l) => {
                const outstanding = Math.max(0, l.ordered - l.received);
                const done = outstanding === 0;
                return (
                  <div key={l.index} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center rounded-md border border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{partMap[l.partId] || l.partId}</p>
                      {done && <span className="text-xs text-green-700 dark:text-green-400">Fully received</span>}
                    </div>
                    <span className="w-16 text-right text-sm text-muted-foreground tabular-nums">{l.ordered}</span>
                    <span className="w-16 text-right text-sm text-muted-foreground tabular-nums">{l.received}</span>
                    <Input
                      type="number"
                      min={0}
                      max={outstanding}
                      value={done ? '' : l.receiveNow}
                      disabled={done}
                      onChange={(e) => updateReceiveLine(l.index, e.target.value)}
                      className="w-24 h-8 text-right"
                      placeholder={done ? '—' : '0'}
                    />
                  </div>
                );
              })}
            </div>
            {receiveError && (
              <div className="mt-3 rounded-md bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive">{receiveError}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReceiveOpen(false); setReceiveOrder(null); }} disabled={receiving}>Cancel</Button>
            <Button onClick={handleSubmitReceive} disabled={receiving}>
              <PackageCheck className="h-4 w-4 mr-1" />
              {receiving ? 'Receiving...' : 'Receive Items'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={(o) => { if (!o) { setRejectOpen(false); setRejectOrder(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Purchase Order</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting {rejectOrder?.poNumber}. It&apos;s recorded in the status history.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="rejectReason">Reason <span className="text-destructive">*</span></Label>
            <Textarea
              id="rejectReason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this PO being rejected?"
              rows={3}
              className="mt-1.5"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectOpen(false); setRejectOrder(null); }} disabled={rejecting}>Cancel</Button>
            <Button variant="destructive" onClick={handleSubmitReject} disabled={rejecting || !rejectReason.trim()}>
              {rejecting ? 'Rejecting...' : 'Reject PO'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Read-only view of PO details. */
function ViewPOContent({
  order,
  vendorMap,
  partMap,
  locationMap,
  userMap,
}: {
  order: PurchaseOrderRow;
  vendorMap: Record<string, string>;
  partMap: Record<string, string>;
  locationMap: Record<string, string>;
  userMap: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      {/* Status & Overview */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Overview</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <ViewField label="PO Number" value={order.poNumber} />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <Badge variant={STATUS_BADGE_VARIANT[order.status] || 'secondary'} className="mt-0.5">
                {STATUS_DISPLAY_NAME[order.status] || order.status}
              </Badge>
            </div>
          </div>
          <ViewField label="Vendor" value={order.vendorName || vendorMap[order.vendorId]} />
          <ViewField label="Delivery Location" value={locationMap[order.deliveryLocationId]} />
          <ViewField label="Approver" value={userMap[order.approverId]} />
          <ViewField label="Created" value={new Date(order.createdAt).toLocaleString()} />
          {order.description && <ViewField label="Description" value={order.description} />}
        </div>
      </div>

      {/* Line Items */}
      {order.lineItems.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Line Items</h3>
          <Separator className="mb-4" />
          <div className="space-y-2">
            {order.lineItems.map((li, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div className="flex-1">
                  <span className="text-sm text-foreground">{partMap[li.partId] || li.partId}</span>
                  <span className="text-xs text-muted-foreground ml-2">x{li.quantity}</span>
                  {(li.receivedQuantity ?? 0) > 0 && (
                    <span
                      className={`text-xs ml-2 ${
                        (li.receivedQuantity ?? 0) >= li.quantity
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-yellow-700 dark:text-yellow-500'
                      }`}
                    >
                      · received {li.receivedQuantity}/{li.quantity}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-sm text-muted-foreground">${li.unitCost.toFixed(2)} ea</span>
                  <span className="text-sm text-foreground font-medium ml-3">${li.total.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cost Summary */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Cost Summary</h3>
        <Separator className="mb-4" />
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">SubTotal</span>
            <span className="text-foreground">${order.subTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Shipping</span>
            <span className="text-foreground">${order.shipping.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Tax ({order.taxType === 'percentage' ? `${order.taxValue}%` : `$${order.taxValue.toFixed(2)}`})
            </span>
            <span className="text-foreground">
              ${(order.taxType === 'percentage'
                ? order.subTotal * (order.taxValue / 100)
                : order.taxValue
              ).toFixed(2)}
            </span>
          </div>
          <Separator />
          <div className="flex justify-between text-sm font-semibold">
            <span className="text-foreground">Total</span>
            <span className="text-foreground">${order.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Documents */}
      {order.documents.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Documents</h3>
          <Separator className="mb-4" />
          <div className="space-y-2">
            {order.documents.map((doc, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="text-sm text-foreground">{doc.originalName}</span>
                <span className="text-xs text-muted-foreground">
                  {doc.size < 1024 * 1024
                    ? `${(doc.size / 1024).toFixed(1)} KB`
                    : `${(doc.size / (1024 * 1024)).toFixed(1)} MB`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rejection info */}
      {order.status === 'rejected' && order.rejectionReason && (
        <div>
          <h3 className="text-sm font-semibold text-destructive mb-3">Rejection Reason</h3>
          <Separator className="mb-4" />
          <p className="text-sm text-foreground">{order.rejectionReason}</p>
          {order.rejectedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Rejected on {new Date(order.rejectedAt).toLocaleString()}
              {order.rejectedBy && userMap[order.rejectedBy] ? ` by ${userMap[order.rejectedBy]}` : ''}
            </p>
          )}
        </div>
      )}

      {/* Approval info */}
      {order.approvedAt && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Approval</h3>
          <Separator className="mb-4" />
          <p className="text-sm text-foreground">
            Approved on {new Date(order.approvedAt).toLocaleString()}
            {order.approvedBy && userMap[order.approvedBy] ? ` by ${userMap[order.approvedBy]}` : ''}
          </p>
        </div>
      )}

      {/* Status History */}
      {order.statusHistory.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Status History</h3>
          <Separator className="mb-4" />
          <div className="space-y-2">
            {order.statusHistory.map((entry, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                  {new Date(entry.changedAt).toLocaleString()}
                </span>
                <div>
                  <span className="text-foreground">
                    {entry.from ? `${STATUS_DISPLAY_NAME[entry.from] || entry.from} → ` : ''}
                    {STATUS_DISPLAY_NAME[entry.to] || entry.to}
                  </span>
                  {entry.note && (
                    <p className="text-xs text-muted-foreground mt-0.5">{entry.note}</p>
                  )}
                </div>
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
