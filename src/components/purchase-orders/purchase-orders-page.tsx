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
  Eye,
  ShoppingCart,
  PackageCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';

import { Badge } from '@/components/ui/badge';
import { CountBadge } from '@/components/ui/count-badge';
import { Input } from '@/components/ui/input';
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
import { ShowArchivedToggle } from '@/components/ui/show-archived-toggle';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Permissions } from '@/consts/permissions';
import { cn, formatDate } from '@/lib/utils';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { useConnection } from '@/hooks/use-connection';
import { CommandManagedFeatureNotice } from '@/components/command/source-badge';
import { checkRecordOwnership } from '@/lib/rbac';
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

/** A line prepared for the receive dialog. */
interface ReceiveLine {
  index: number;
  partId: string;
  ordered: number;
  received: number;
  receiveNow: string;
}

const PO_FORM_ID = 'maintenance.purchaseOrders.purchaseOrder';

export function PurchaseOrdersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { hasFullAccess, permissionIndex } = useRoleAccess();
  // Connected to Command → procurement is owned by Command; the PO feature is
  // hidden here (see also the sidebar nav guard).
  const { connected } = useConnection();

  // Permission levels for row-level "OWN" checks
  const editLevel = hasFullAccess ? 'ALL' : permissionIndex.getEditLevel(PO_FORM_ID);
  const archiveLevel = hasFullAccess ? 'ALL' : permissionIndex.getArchiveLevel(PO_FORM_ID);
  const deleteLevel = hasFullAccess ? 'ALL' : permissionIndex.getDeleteLevel(PO_FORM_ID);

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

  // Archive state
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingOrder, setArchivingOrder] = useState<PurchaseOrderRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<PurchaseOrderRow | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      if (showArchived) params.set('showArchived', 'true');

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
  }, [rowsPerPage, debouncedSearch, activeTab, showArchived]);

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

  // Archive
  const handleOpenArchive = (order: PurchaseOrderRow) => {
    setArchivingOrder(order);
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    if (!archivingOrder) return;
    setArchiving(true);
    try {
      await axios.patch(`/api/purchase-orders/${archivingOrder.id}/archive`, { archived: !showArchived }, { withCredentials: true });
      setArchiveDialogOpen(false);
      setArchivingOrder(null);
      fetchOrders(pagination.page);
    } catch (err) {
      console.error('Failed to archive/unarchive purchase order:', err);
    } finally {
      setArchiving(false);
    }
  };

  // Delete handlers
  const handleOpenDelete = (order: PurchaseOrderRow) => {
    setDeletingOrder(order);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingOrder) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/purchase-orders/${deletingOrder.id}`, { withCredentials: true });
      setDeleteDialogOpen(false);
      setDeletingOrder(null);
      fetchOrders(pagination.page);
    } catch (err) {
      console.error('Failed to delete purchase order:', err);
    } finally {
      setDeleting(false);
    }
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
      await axios.post(
        `/api/purchase-orders/${receiveOrder.id}/receive`,
        { receipts },
        { withCredentials: true },
      );
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
      sortable: true,
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
      sortable: true,
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
      sortable: true,
      render: (order) => (
        <span className="text-foreground">{order.vendorName || '—'}</span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      label: 'Total',
      sortable: true,
      render: (order) => (
        <span className="text-foreground font-medium">${order.total.toFixed(2)}</span>
      ),
    },
    {
      key: 'lineItemCount',
      header: 'Items',
      label: 'Items count',
      render: (order) =>
        order.lineItems.length === 0
          ? <span className="text-muted-foreground">—</span>
          : <CountBadge count={order.lineItems.length} variant="blue" size="sm" />,
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
      sortable: true,
      sortValue: (order) => new Date(order.createdAt).getTime(),
      render: (order) => (
        <span className="text-muted-foreground text-xs">
          {formatDate(order.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (order) => (
        <RowActions>
          {showArchived ? (
            <>
              {checkRecordOwnership(archiveLevel, order.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.maintenance.purchaseOrders.form.archive}>
                  <RowActionButton label="Unarchive" icon={<ArchiveRestore />} onClick={() => handleOpenArchive(order)} />
                </PermissionGuard>
              )}
              {checkRecordOwnership(deleteLevel, order.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.maintenance.purchaseOrders.form.delete}>
                  <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(order)} />
                </PermissionGuard>
              )}
            </>
          ) : (
            <>
              <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => router.push(`/maintenance/purchase-orders/${order.id}`)} />
              {['purchased', 'received_partial'].includes(order.status) && (
                <RowActionButton label="Receive" tone="primary" icon={<PackageCheck />} onClick={() => handleOpenReceive(order)} />
              )}
              {checkRecordOwnership(editLevel, order.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.maintenance.purchaseOrders.form.edit}>
                  {['draft', 'rejected'].includes(order.status) && (
                    <RowActionButton label="Edit" icon={<Edit />} onClick={() => handleOpenEdit(order)} />
                  )}
                </PermissionGuard>
              )}
              {checkRecordOwnership(archiveLevel, order.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.maintenance.purchaseOrders.form.archive}>
                  <RowActionButton label="Archive" tone="destructive" icon={<Archive />} onClick={() => handleOpenArchive(order)} />
                </PermissionGuard>
              )}
            </>
          )}
        </RowActions>
      ),
    },
  ];

  // While connected to Command, purchase orders are managed in Command only —
  // render a notice instead of the PO management UI (handles direct URL access).
  if (connected) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Purchase Orders" description="Managed in Command while connected" />
        <CommandManagedFeatureNotice feature="Purchase Orders" />
      </div>
    );
  }

  return (
    <div className="relative flex h-full">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader title="Purchase Orders" description="Track and manage procurement from request to delivery" count={pagination.total}>
          <PermissionGuard permission={Permissions.maintenance.purchaseOrders.form.create}>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" />
              Create PO
            </Button>
          </PermissionGuard>
        </PageHeader>

        {/* Status Tabs */}
        <div className="px-6 pb-4 flex items-center gap-4">
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
            afterControls={
              <ShowArchivedToggle checked={showArchived} onCheckedChange={setShowArchived} />
            }
            searchNode={
              <SearchInput value={search} onChange={setSearch} placeholder="Search purchase orders..." />
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
            onRowClick={showArchived ? undefined : (order) => router.push(`/maintenance/purchase-orders/${order.id}`)}
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

      {/* Archive Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={archivingOrder?.poNumber}
        action={showArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingOrder?.poNumber}
        onConfirm={handleDelete}
        loading={deleting}
      />

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

    </div>
  );
}

