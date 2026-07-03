'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  Wrench,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn, type DataTableFilterDef } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { PageHeader } from '@/components/ui/page-header';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';
import { FilterTabs } from '@/components/ui/filter-tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { FaultForm } from './fault-form';
import { WorkOrderForm } from '@/components/work-orders/work-order-form';
import type { FaultRow, Pagination } from './types';
import {
  FAULT_STATUS_TABS,
  STATUS_BADGE_VARIANT,
  STATUS_DISPLAY_NAME,
  PRIORITY_BADGE_CLASSES,
  PRIORITY_DISPLAY_NAME,
  CATEGORY_DISPLAY_NAME,
} from './types';

export function FaultsPage() {
  const [faults, setFaults] = useState<FaultRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [activeTab, setActiveTab] = useState('all');

  // Teams for filter
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('/api/teams?limit=100', { withCredentials: true });
        const data = res.data.data;
        const items = Array.isArray(data) ? data : data?.items || [];
        setTeams(items.map((t: Record<string, string>) => ({ id: t.id, name: t.name })));
      } catch {
        // Silent
      }
    })();
  }, []);

  // Filter definitions for toolbar
  const faultFilterDefs: DataTableFilterDef[] = useMemo(() => [
    ...(teams.length > 0
      ? [{
          columnKey: 'teamId',
          label: 'Team',
          type: 'select' as const,
          options: teams.map((t) => ({ label: t.name, value: t.id })),
        }]
      : []),
    {
      columnKey: 'category',
      label: 'Category',
      type: 'select',
      options: [
        { label: 'Mechanical', value: 'mechanical' },
        { label: 'Electrical', value: 'electrical' },
        { label: 'Hydraulic', value: 'hydraulic' },
        { label: 'Body', value: 'body' },
        { label: 'Tyres', value: 'tyres' },
        { label: 'Safety', value: 'safety' },
        { label: 'Other', value: 'other' },
      ],
    },
    {
      columnKey: 'priority',
      label: 'Severity',
      type: 'select',
      options: [
        { label: 'High', value: 'high' },
        { label: 'Medium', value: 'medium' },
        { label: 'Low', value: 'low' },
      ],
    },
  ], [teams]);

  // Table features
  const {
    hiddenColumnKeys, setHiddenColumnKeys,
    density, setDensity,
    filters, setFilter, clearFilters,
  } = useDataTable();

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create');
  const [editingFault, setEditingFault] = useState<FaultRow | null>(null);

  // Work-order panel state (raise a WO from a fault)
  const [woPanelOpen, setWoPanelOpen] = useState(false);
  const [woFault, setWoFault] = useState<FaultRow | null>(null);

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewFault, setViewFault] = useState<FaultRow | null>(null);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingFault, setDeletingFault] = useState<FaultRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Row selection
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Bulk status update
  const handleBulkStatusUpdate = async (newStatus: string) => {
    if (selectedKeys.size === 0) return;
    setUpdatingStatus(true);
    try {
      await axios.put('/api/faults/bulk-status', {
        ids: Array.from(selectedKeys),
        status: newStatus,
      }, { withCredentials: true });
      setSelectedKeys(new Set());
      fetchFaults(pagination.page);
    } catch {
      // Silent
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Fetch faults
  const fetchFaults = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (activeTab !== 'all') params.set('status', activeTab);

      const selectedCategory = (filters.category as string[]) ?? [];
      if (selectedCategory.length > 0) params.set('category', selectedCategory[0]);

      const selectedPriority = (filters.priority as string[]) ?? [];
      if (selectedPriority.length > 0) params.set('priority', selectedPriority[0]);

      const selectedTeams = (filters.teamId as string[]) ?? [];
      if (selectedTeams.length > 0) params.set('teamId', selectedTeams[0]);

      const res = await axios.get(`/api/faults?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setFaults(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
      setSelectedKeys(new Set());
    } catch {
      setFaults([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage, debouncedSearch, activeTab, filters]);

  useEffect(() => { fetchFaults(1); }, [fetchFaults]);

  // Panel handlers
  const handleOpenCreate = () => { setEditingFault(null); setPanelMode('create'); setPanelOpen(true); };
  const handleOpenEdit = (fault: FaultRow) => { setEditingFault(fault); setPanelMode('edit'); setPanelOpen(true); };
  const handleClosePanel = () => { setPanelOpen(false); setEditingFault(null); };
  const handleSaved = () => {
    handleClosePanel();
    fetchFaults(panelMode === 'create' ? 1 : pagination.page);
  };

  // View dialog
  const handleOpenView = (fault: FaultRow) => { setViewFault(fault); setViewDialogOpen(true); };

  // Work order panel — raise a WO for a fault
  const handleOpenCreateWO = (fault: FaultRow) => {
    setViewDialogOpen(false);
    setWoFault(fault);
    setWoPanelOpen(true);
  };
  const handleCloseWOPanel = () => { setWoPanelOpen(false); setWoFault(null); };
  const handleWOSaved = () => {
    handleCloseWOPanel();
    fetchFaults(pagination.page);
  };

  // Delete
  const handleOpenDelete = (fault: FaultRow) => { setDeletingFault(fault); setDeleteDialogOpen(true); };
  const handleDelete = async () => {
    if (!deletingFault) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/faults/${deletingFault.id}`, { withCredentials: true });
      setDeleteDialogOpen(false); setDeletingFault(null);
      fetchFaults(pagination.page);
    } catch { /* silent */ } finally { setDeleting(false); }
  };

  // Column definitions
  const faultColumns: DataTableColumn<FaultRow>[] = [
    {
      key: 'faultNumber',
      header: 'Fault #',
      label: 'Fault number',
      pinned: true,
      sortable: true,
      render: (fault) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground font-mono text-sm">{fault.faultNumber}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      label: 'Status',
      pinned: true,
      sortable: true,
      render: (fault) => (
        <Badge variant={STATUS_BADGE_VARIANT[fault.status] || 'secondary'}>
          {STATUS_DISPLAY_NAME[fault.status] || fault.status}
        </Badge>
      ),
    },
    {
      key: 'title',
      header: 'Title',
      label: 'Title',
      sortable: true,
      render: (fault) => (
        <span className="text-foreground">{fault.title}</span>
      ),
    },
    {
      key: 'assetName',
      header: 'Asset',
      label: 'Asset',
      sortable: true,
      render: (fault) => (
        <span className="text-foreground">{fault.assetName || '\u2014'}</span>
      ),
    },
    {
      key: 'reportedByName',
      header: 'Reported By',
      label: 'Reported By',
      sortable: true,
      render: (fault) => (
        <span className="text-muted-foreground">{fault.reportedByName || '\u2014'}</span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      label: 'Category',
      sortable: true,
      render: (fault) => (
        <span className="text-foreground">{CATEGORY_DISPLAY_NAME[fault.category] || fault.category}</span>
      ),
    },
    {
      key: 'priority',
      header: 'Severity',
      label: 'Severity',
      sortable: true,
      render: (fault) => (
        <span className={cn(
          'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
          PRIORITY_BADGE_CLASSES[fault.priority] || 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
        )}>
          {PRIORITY_DISPLAY_NAME[fault.priority] || fault.priority}
        </span>
      ),
    },
    {
      key: 'reportedAt',
      header: 'Reported At',
      label: 'Reported At',
      sortable: true,
      sortValue: (fault) => fault.reportedAt ? new Date(fault.reportedAt).getTime() : null,
      render: (fault) => (
        <span className="text-muted-foreground text-xs">
          {fault.reportedAt ? new Date(fault.reportedAt).toLocaleDateString() : '\u2014'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (fault) => (
        <RowActions>
          {fault.workOrderNumber ? (
            <Badge variant="outline" className="font-mono text-xs gap-1">
              <Wrench className="h-3 w-3" />{fault.workOrderNumber}
            </Badge>
          ) : (
            <RowActionButton
              label="Create work order"
              icon={<Wrench />}
              onClick={() => handleOpenCreateWO(fault)}
            />
          )}
          <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => handleOpenView(fault)} />
          <RowActionButton label="Edit" icon={<Pencil />} onClick={() => handleOpenEdit(fault)} />
          <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(fault)} />
        </RowActions>
      ),
    },
  ];

  return (
    <div className="relative flex h-full">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader title="Faults" count={pagination.total}>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Create Fault
          </Button>
        </PageHeader>

        {/* Status Tabs */}
        <div className="px-6 pb-4">
          <FilterTabs
            value={activeTab}
            onChange={setActiveTab}
            tabs={FAULT_STATUS_TABS.map((tab) => ({ value: tab.key, label: tab.label }))}
          />
        </div>

        <div className="flex-1 overflow-auto px-6 pb-6">
          <DataTableToolbar
            columns={faultColumns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
            filterDefs={faultFilterDefs}
            filters={filters}
            onFilterChange={setFilter}
            onFiltersClear={clearFilters}
            actions={
              <Select
                value=""
                onValueChange={handleBulkStatusUpdate}
                disabled={selectedKeys.size === 0 || updatingStatus}
              >
                <SelectTrigger className={cn(
                  'w-[180px] shrink-0',
                  selectedKeys.size === 0 && 'opacity-50',
                )}>
                  <SelectValue placeholder={
                    updatingStatus
                      ? 'Updating...'
                      : selectedKeys.size > 0
                        ? `Update Status (${selectedKeys.size})`
                        : 'Update Status'
                  } />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="wont_fix">Won&apos;t Fix</SelectItem>
                </SelectContent>
              </Select>
            }
            searchNode={
              <SearchInput value={search} onChange={setSearch} placeholder="Search faults..." />
            }
          />
          <DataTable<FaultRow>
            columns={faultColumns}
            data={faults}
            pagination={pagination}
            loading={loading}
            rowsPerPage={rowsPerPage}
            onPageChange={fetchFaults}
            onRowsPerPageChange={setRowsPerPage}
            onRowClick={handleOpenView}
            rowKey={(f) => f.id}
            density={density}
            hiddenColumnKeys={hiddenColumnKeys}
            selectable
            selectedKeys={selectedKeys}
            onSelectedKeysChange={setSelectedKeys}
            emptyMessage={
              debouncedSearch
                ? 'No faults match your search.'
                : activeTab !== 'all'
                  ? `No ${STATUS_DISPLAY_NAME[activeTab] || activeTab} faults.`
                  : 'No faults yet. Click "Create Fault" to create one.'
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

      {/* Right Panel — Fault Form (slide-out) */}
      <div className={cn(
        'fixed top-0 right-0 z-50 h-full w-[560px] border-l border-border bg-background transition-transform duration-300',
        panelOpen ? 'translate-x-0' : 'translate-x-full',
      )}>
        {panelOpen && (
          <FaultForm
            mode={panelMode}
            fault={editingFault}
            onClose={handleClosePanel}
            onSaved={handleSaved}
          />
        )}
      </div>

      {/* Work Order panel backdrop */}
      {woPanelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={handleCloseWOPanel}
        />
      )}

      {/* Right Panel — Work Order Form (raise WO from a fault) */}
      <div className={cn(
        'fixed top-0 right-0 z-50 h-full w-[560px] border-l border-border bg-background transition-transform duration-300',
        woPanelOpen ? 'translate-x-0' : 'translate-x-full',
      )}>
        {woPanelOpen && woFault && (
          <WorkOrderForm
            mode="create"
            source="fault"
            initialAssetId={woFault.assetId}
            initialFaultIds={[woFault.id]}
            lockAsset
            onClose={handleCloseWOPanel}
            onSaved={handleWOSaved}
          />
        )}
      </div>

      {/* View Fault Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewFault?.faultNumber || 'Fault Details'}</DialogTitle>
            <DialogDescription>Fault overview.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {viewFault && <ViewFaultContent fault={viewFault} />}
          </div>
          <DialogFooter>
            {viewFault && !viewFault.workOrderNumber && (
              <Button onClick={() => handleOpenCreateWO(viewFault)}>
                <Wrench className="h-4 w-4 mr-1" /> Create Work Order
              </Button>
            )}
            <Button variant="outline" onClick={() => { setViewDialogOpen(false); if (viewFault) handleOpenEdit(viewFault); }}>
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
            <DialogTitle>Delete Fault</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingFault?.faultNumber}&quot;? This action cannot be undone.
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

/** Read-only view of fault details. */
function ViewFaultContent({ fault }: { fault: FaultRow }) {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Overview</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <ViewField label="Fault Number" value={fault.faultNumber} />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <Badge variant={STATUS_BADGE_VARIANT[fault.status] || 'secondary'} className="mt-0.5">
                {STATUS_DISPLAY_NAME[fault.status] || fault.status}
              </Badge>
            </div>
          </div>
          <ViewField label="Title" value={fault.title} />
          <ViewField label="Description" value={fault.description} />
          <ViewField label="Reported At" value={fault.reportedAt ? new Date(fault.reportedAt).toLocaleDateString() : undefined} />
          {fault.workOrderNumber && (
            <ViewField label="Work Order" value={fault.workOrderNumber} />
          )}
          {fault.takeOutOfService && (
            <div>
              <p className="text-sm font-medium text-destructive">Asset taken out of service</p>
            </div>
          )}
        </div>
      </div>

      {/* Asset & Reporter */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Asset & Reporter</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <ViewField label="Asset" value={fault.assetName} />
          <ViewField label="Reported By" value={fault.reportedByName || undefined} />
          <ViewField label="Reporter Type" value={fault.reportedByType === 'driver' ? 'Driver' : 'Team Member'} />
        </div>
      </div>

      {/* Classification */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Classification</h3>
        <Separator className="mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Category" value={CATEGORY_DISPLAY_NAME[fault.category] || fault.category} />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Severity</p>
            <span className={cn(
              'mt-0.5 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
              PRIORITY_BADGE_CLASSES[fault.priority] || 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
            )}>
              {PRIORITY_DISPLAY_NAME[fault.priority] || fault.priority}
            </span>
          </div>
        </div>
      </div>

      {/* Meter */}
      {(fault.meterType || fault.meterReading != null) && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Meter</h3>
          <Separator className="mb-4" />
          <div className="grid grid-cols-2 gap-4">
            <ViewField label="Meter Type" value={fault.meterType || undefined} />
            <ViewField label="Meter Reading" value={fault.meterReading != null ? String(fault.meterReading) : undefined} />
          </div>
        </div>
      )}

      {/* Attachments */}
      {fault.attachments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Attachments</h3>
          <Separator className="mb-4" />
          <div className="space-y-2">
            {fault.attachments.map((att, i) => (
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
        </div>
      )}

      {/* Metadata */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Details</h3>
        <Separator className="mb-4" />
        <ViewField label="Created" value={new Date(fault.createdAt).toLocaleString()} />
      </div>
    </div>
  );
}

function ViewField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground mt-0.5">{value || '\u2014'}</p>
    </div>
  );
}
