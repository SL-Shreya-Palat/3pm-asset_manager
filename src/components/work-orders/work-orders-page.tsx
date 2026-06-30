'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  Wrench,
  CheckCircle2,
  ClipboardList,
  Package,
  Users,
  Paperclip,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { FormSection } from '@/components/ui/form-section';
import { PageHeader } from '@/components/ui/page-header';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';
import { MeterTypeSelect, ProgramChecklist } from '@/components/maintenance/service-fields';
import { cn } from '@/lib/utils';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import { WorkOrderForm } from './work-order-form';
import type {
  WorkOrderRow,
  WOStatusOption,
  LookupOption,
  Pagination,
} from './types';

export function WorkOrdersPage() {
  const [orders, setOrders] = useState<WorkOrderRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [activeTab, setActiveTab] = useState('all');

  // Dynamic status tabs from API
  const [statusTabs, setStatusTabs] = useState<WOStatusOption[]>([]);

  // Lookup maps
  const [assetMap, setAssetMap] = useState<Record<string, string>>({});
  const [serviceTaskMap, setServiceTaskMap] = useState<Record<string, string>>({});
  const [userMap, setUserMap] = useState<Record<string, string>>({});

  // Table features
  const {
    hiddenColumnKeys, setHiddenColumnKeys,
    density, setDensity,
  } = useDataTable();

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create');
  const [editingOrder, setEditingOrder] = useState<WorkOrderRow | null>(null);

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewOrder, setViewOrder] = useState<WorkOrderRow | null>(null);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<WorkOrderRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Complete dialog
  const [completeOrder, setCompleteOrder] = useState<WorkOrderRow | null>(null);

  // Fetch lookup data + status tabs
  const fetchLookups = useCallback(async () => {
    try {
      const [assetsRes, tasksRes, usersRes, statusesRes] = await Promise.all([
        axios.get('/api/assets?limit=100', { withCredentials: true }),
        axios.get('/api/service-tasks?limit=100', { withCredentials: true }),
        axios.get('/api/users?limit=100', { withCredentials: true }),
        axios.get('/api/work-order-statuses', { withCredentials: true }),
      ]);
      const toMap = (items: LookupOption[]) => {
        const map: Record<string, string> = {};
        items.forEach((i) => { map[i.id] = i.name; });
        return map;
      };
      const assetItems = assetsRes.data.data?.items || assetsRes.data.data || [];
      setAssetMap(toMap(assetItems.map((i: Record<string, unknown>) => ({ id: i.id as string, name: i.name as string }))));
      const taskItems = tasksRes.data.data?.items || tasksRes.data.data || [];
      setServiceTaskMap(toMap(taskItems.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        name: (i.title as string) || (i.name as string) || '',
      }))));
      const userItems = usersRes.data.data?.items || usersRes.data.data || [];
      setUserMap(toMap(userItems.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        name: (i.name as string) || `${(i.firstName as string) || ''} ${(i.lastName as string) || ''}`.trim() || (i.email as string) || '',
      }))));

      const statusItems = statusesRes.data.data || [];
      setStatusTabs(statusItems.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        label: i.label as string,
        color: i.color as string,
        approvalRequired: i.approvalRequired as boolean,
        sequence: i.sequence as number,
      })));
    } catch {
      // Silent
    }
  }, []);

  // Fetch work orders
  const fetchOrders = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (activeTab !== 'all') params.set('statusId', activeTab);

      const res = await axios.get(`/api/work-orders?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setOrders(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage, debouncedSearch, activeTab]);

  useEffect(() => { fetchLookups(); }, [fetchLookups]);
  useEffect(() => { fetchOrders(1); }, [fetchOrders]);

  // Panel handlers
  const handleOpenCreate = () => { setEditingOrder(null); setPanelMode('create'); setPanelOpen(true); };
  const handleOpenEdit = (order: WorkOrderRow) => { setEditingOrder(order); setPanelMode('edit'); setPanelOpen(true); };
  const handleClosePanel = () => { setPanelOpen(false); setEditingOrder(null); };
  const handleSaved = () => {
    handleClosePanel();
    fetchOrders(panelMode === 'create' ? 1 : pagination.page);
  };

  // View dialog
  const handleOpenView = (order: WorkOrderRow) => { setViewOrder(order); setViewDialogOpen(true); };

  // Complete & sign off
  const handleOpenComplete = (order: WorkOrderRow) => { setViewDialogOpen(false); setCompleteOrder(order); };
  const handleCompleted = () => { setCompleteOrder(null); fetchOrders(pagination.page); };

  // Delete
  const handleOpenDelete = (order: WorkOrderRow) => { setDeletingOrder(order); setDeleteDialogOpen(true); };
  const handleDelete = async () => {
    if (!deletingOrder) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/work-orders/${deletingOrder.id}`, { withCredentials: true });
      setDeleteDialogOpen(false); setDeletingOrder(null);
      fetchOrders(pagination.page);
    } catch { /* silent */ } finally { setDeleting(false); }
  };

  // Build status color map for badges
  const statusColorMap: Record<string, string> = {};
  const statusLabelMap: Record<string, string> = {};
  statusTabs.forEach((s) => {
    statusColorMap[s.id] = s.color;
    statusLabelMap[s.id] = s.label;
  });

  // Column definitions
  const woColumns: DataTableColumn<WorkOrderRow>[] = [
    {
      key: 'workOrderNumber',
      header: 'WO #',
      label: 'WO number',
      pinned: true,
      render: (order) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Wrench className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground font-mono text-sm">{order.workOrderNumber}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      label: 'Status',
      pinned: true,
      render: (order) =>
        order.isCompleted ? (
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            <CheckCircle2 className="h-3 w-3" /> Completed
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border"
            style={{
              backgroundColor: `${statusColorMap[order.statusId] || '#6B7280'}20`,
              borderColor: statusColorMap[order.statusId] || '#6B7280',
              color: statusColorMap[order.statusId] || '#6B7280',
            }}
          >
            {order.statusLabel || statusLabelMap[order.statusId] || '—'}
          </Badge>
        ),
    },
    {
      key: 'assetName',
      header: 'Asset',
      label: 'Asset',
      render: (order) => (
        <span className="text-foreground">{order.assetName || assetMap[order.assetId] || '—'}</span>
      ),
    },
    {
      key: 'assigneeName',
      header: 'Assignee',
      label: 'Assignee',
      render: (order) => (
        <span className="text-foreground">{order.assigneeName || '—'}</span>
      ),
    },
    {
      key: 'dueDate',
      header: 'Due Date',
      label: 'Due date',
      render: (order) => (
        <span className="text-muted-foreground text-xs">
          {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'serviceTaskCount',
      header: 'Items',
      label: 'Items count',
      render: (order) => (
        <span className="text-muted-foreground">{order.serviceTaskIds.length}</span>
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
          <RowActionButton label="Edit" icon={<Pencil />} onClick={() => handleOpenEdit(order)} />
          <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(order)} />
        </RowActions>
      ),
    },
  ];

  return (
    <div className="relative flex h-full">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader title="Work Orders" count={pagination.total}>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Create Work Order
          </Button>
        </PageHeader>

        {/* Dynamic Status Tabs */}
        <div className="px-6 pb-4">
          <FilterTabs
            value={activeTab}
            onChange={setActiveTab}
            tabs={[
              { value: 'all', label: 'All' },
              ...statusTabs.map((tab) => ({ value: tab.id, label: tab.label, color: tab.color })),
            ]}
          />
        </div>

        <div className="px-6 pb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search work orders..." />
        </div>

        <div className="flex-1 overflow-auto px-6 pb-6">
          <DataTableToolbar
            columns={woColumns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
          />
          <DataTable<WorkOrderRow>
            columns={woColumns}
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
                ? 'No work orders match your search.'
                : activeTab !== 'all'
                  ? `No work orders with this status.`
                  : 'No work orders yet. Click "Create Work Order" to create one.'
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

      {/* Right Panel — WO Form (slide-out) */}
      <div className={cn(
        'fixed top-0 right-0 z-50 h-full w-[560px] border-l border-border bg-background transition-transform duration-300',
        panelOpen ? 'translate-x-0' : 'translate-x-full',
      )}>
        {panelOpen && (
          <WorkOrderForm
            mode={panelMode}
            workOrder={editingOrder}
            onClose={handleClosePanel}
            onSaved={handleSaved}
          />
        )}
      </div>

      {/* View WO Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewOrder?.workOrderNumber || 'Work Order Details'}</DialogTitle>
            <DialogDescription>Work order overview.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {viewOrder && (
              <ViewWOContent
                order={viewOrder}
                assetMap={assetMap}
                serviceTaskMap={serviceTaskMap}
                userMap={userMap}
                statusColorMap={statusColorMap}
                statusLabelMap={statusLabelMap}
              />
            )}
          </div>
          <DialogFooter>
            {viewOrder && !viewOrder.isCompleted && (
              <Button onClick={() => handleOpenComplete(viewOrder)}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Complete &amp; Sign Off
              </Button>
            )}
            <Button variant="outline" onClick={() => { setViewDialogOpen(false); if (viewOrder) handleOpenEdit(viewOrder); }}>
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
            <DialogTitle>Delete Work Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingOrder?.workOrderNumber}&quot;? This action cannot be undone.
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

      {/* Complete & Sign Off Dialog (remounts per order so the form is always fresh) */}
      {completeOrder && (
        <CompleteWorkOrderDialog
          key={completeOrder.id}
          order={completeOrder}
          onClose={() => setCompleteOrder(null)}
          onCompleted={handleCompleted}
        />
      )}
    </div>
  );
}

/** Complete & sign-off dialog — captures meter reading, notes, and which of the
 *  asset's scheduled service programs this WO fulfilled. */
function CompleteWorkOrderDialog({
  order,
  onClose,
  onCompleted,
}: {
  order: WorkOrderRow;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [programs, setPrograms] = useState<{ programId: string; title: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [meter, setMeter] = useState('');
  const [meterType, setMeterType] = useState('odometer');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load the asset's service programs so the user can mark which were fulfilled.
  // No state reset needed — the dialog is remounted per WO via a `key`.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await axios.get(`/api/assets/${order.assetId}/service-status`, { withCredentials: true });
        if (active) {
          setPrograms((res.data.data?.programs ?? []).map((p: { programId: string; title: string }) => ({ programId: p.programId, title: p.title })));
        }
      } catch {
        if (active) setPrograms([]);
      }
    })();
    return () => { active = false; };
  }, [order.assetId]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const handleComplete = async () => {
    if (!order) return;
    setError('');
    try {
      setSaving(true);
      await axios.put(`/api/work-orders/${order.id}/complete`, {
        servicePrograms: [...selected],
        meterType,
        meterAtService: meter ? parseFloat(meter) : undefined,
        notes: notes.trim() || undefined,
      }, { withCredentials: true });
      onCompleted();
    } catch {
      setError('Failed to complete work order');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Complete {order.workOrderNumber}</DialogTitle>
          <DialogDescription>
            Closes the work order, corrects its linked defects, and returns the asset to service.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          <div>
            <ProgramChecklist
              programs={programs}
              selected={selected}
              onToggle={toggle}
              label="Scheduled services fulfilled"
            />
            {programs.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Selected programs&apos; schedules reset from this service.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cmpMeter">Meter reading</Label>
              <Input id="cmpMeter" type="number" min="0" value={meter} onChange={(e) => setMeter(e.target.value)} placeholder="e.g. 50000" className="mt-1.5" />
            </div>
            <div>
              <Label>Meter type</Label>
              <MeterTypeSelect value={meterType} onChange={setMeterType} />
            </div>
          </div>

          <div>
            <Label htmlFor="cmpNotes">Notes</Label>
            <Textarea id="cmpNotes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1.5" placeholder="Sign-off notes..." />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleComplete} disabled={saving}>
            {saving ? 'Completing...' : 'Complete & Sign Off'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Read-only view of WO details. */
function ViewWOContent({
  order,
  assetMap,
  serviceTaskMap,
  userMap,
  statusColorMap,
  statusLabelMap,
}: {
  order: WorkOrderRow;
  assetMap: Record<string, string>;
  serviceTaskMap: Record<string, string>;
  userMap: Record<string, string>;
  statusColorMap: Record<string, string>;
  statusLabelMap: Record<string, string>;
}) {
  const assigneeTypeLabel = order.assigneeType === 'vendor'
    ? 'Vendor'
    : order.assigneeType === 'mechanic'
      ? 'Mechanic'
      : 'Third Party';

  return (
    <div className="space-y-6">
      {/* Overview */}
      <FormSection icon={ClipboardList} title="Overview">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <ViewField label="WO Number" value={order.workOrderNumber} />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <Badge
                variant="outline"
                className="mt-0.5 border"
                style={{
                  backgroundColor: `${statusColorMap[order.statusId] || '#6B7280'}20`,
                  borderColor: statusColorMap[order.statusId] || '#6B7280',
                  color: statusColorMap[order.statusId] || '#6B7280',
                }}
              >
                {order.statusLabel || statusLabelMap[order.statusId] || '—'}
              </Badge>
            </div>
          </div>
          <ViewField label="Asset" value={order.assetName || assetMap[order.assetId]} />
          <ViewField label="Due Date" value={order.dueDate ? new Date(order.dueDate).toLocaleDateString() : undefined} />
          <ViewField label="Created" value={new Date(order.createdAt).toLocaleString()} />
          {order.isCompleted && (
            <ViewField label="Completed" value={order.completedAt ? new Date(order.completedAt).toLocaleString() : 'Yes'} />
          )}
          {order.description && <ViewField label="Description" value={order.description} />}
        </div>
      </FormSection>

      {/* Service Tasks */}
      {order.serviceTaskIds.length > 0 && (
        <FormSection icon={Wrench} title="Items">
          <div className="space-y-2">
            {order.serviceTaskIds.map((taskId, i) => (
              <div key={i} className="rounded-md border border-border px-3 py-2">
                <span className="text-sm text-foreground">{serviceTaskMap[taskId] || taskId}</span>
              </div>
            ))}
          </div>
        </FormSection>
      )}

      {/* Parts */}
      {order.parts && order.parts.length > 0 && (
        <FormSection icon={Package} title="Parts">
          <div className="rounded-md border border-border divide-y divide-border">
            {order.parts.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2">
                <div className="min-w-0">
                  <span className="text-sm text-foreground">{p.partName}</span>
                  <span className="text-xs text-muted-foreground ml-2">×{p.quantity}</span>
                </div>
                <span className="text-sm text-foreground">{p.lineTotal.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
              <span className="text-sm font-medium">Parts total</span>
              <span className="text-sm font-semibold">{(order.partsCost ?? 0).toFixed(2)}</span>
            </div>
          </div>
        </FormSection>
      )}

      {/* Assignee */}
      <FormSection icon={Users} title="Assignee">
        <div className="space-y-4">
          <ViewField label="Type" value={assigneeTypeLabel} />
          <ViewField label="Name" value={order.assigneeName} />
          {order.assigneeContact && <ViewField label="Contact" value={order.assigneeContact} />}
          {order.assigneeEmail && <ViewField label="Email" value={order.assigneeEmail} />}
          {order.assigneePhone && <ViewField label="Phone" value={order.assigneePhone} />}
          {order.thirdPartyName && <ViewField label="Third Party Name" value={order.thirdPartyName} />}
          {order.thirdPartyEmail && <ViewField label="Third Party Email" value={order.thirdPartyEmail} />}
        </div>
      </FormSection>

      {/* Attachments */}
      {order.attachments.length > 0 && (
        <FormSection icon={Paperclip} title="Attachments">
          <div className="space-y-2">
            {order.attachments.map((att, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="text-sm text-foreground">{att.originalName}</span>
                <span className="text-xs text-muted-foreground">
                  {att.size < 1024 * 1024
                    ? `${(att.size / 1024).toFixed(1)} KB`
                    : `${(att.size / (1024 * 1024)).toFixed(1)} MB`}
                </span>
              </div>
            ))}
          </div>
        </FormSection>
      )}

      {/* Status History */}
      {order.statusHistory.length > 0 && (
        <FormSection icon={History} title="Status History">
          <div className="space-y-2">
            {order.statusHistory.map((entry, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                  {new Date(entry.changedAt).toLocaleString()}
                </span>
                <div>
                  <span className="text-foreground">
                    {entry.fromStatusLabel ? `${entry.fromStatusLabel} → ` : ''}
                    {entry.toStatusLabel}
                  </span>
                  {entry.changedBy && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      by {userMap[entry.changedBy] || entry.changedBy}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </FormSection>
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
