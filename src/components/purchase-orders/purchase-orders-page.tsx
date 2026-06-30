'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  ShoppingCart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/ui/search-input';
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
  const handleOpenView = (order: PurchaseOrderRow) => { setViewOrder(order); setViewDialogOpen(true); };

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
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" className="cursor-pointer" onClick={() => handleOpenView(order)}>
            <Eye className="h-4 w-4" />
          </Button>
          {['draft', 'rejected'].includes(order.status) && (
            <Button variant="ghost" size="icon-sm" className="cursor-pointer" onClick={() => handleOpenEdit(order)}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {order.status === 'draft' && (
            <Button variant="ghost" size="icon-sm" className="cursor-pointer text-destructive hover:text-destructive" onClick={() => handleOpenDelete(order)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="relative flex h-full">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h1 className="text-2xl font-semibold text-foreground">
            Purchase Orders
            <span className="text-muted-foreground font-normal ml-2">({pagination.total})</span>
          </h1>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Create PO
          </Button>
        </div>

        {/* Status Tabs */}
        <div className="px-6 pb-4">
          <div className="flex gap-1 flex-wrap">
            {PO_STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-md transition-colors',
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 pb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search purchase orders..." />
        </div>

        <div className="flex-1 overflow-auto px-6 pb-6">
          <DataTableToolbar
            columns={poColumns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
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
          <DialogFooter>
            {viewOrder && ['draft', 'rejected'].includes(viewOrder.status) && (
              <Button variant="outline" onClick={() => { setViewDialogOpen(false); if (viewOrder) handleOpenEdit(viewOrder); }}>
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
            )}
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
