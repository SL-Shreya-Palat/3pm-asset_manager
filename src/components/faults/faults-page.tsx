'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Plus,
  Edit,
  Archive,
  ArchiveRestore,
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
import { ShowArchivedToggle } from '@/components/ui/show-archived-toggle';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { Separator } from '@/components/ui/separator';
import { cn, formatDate } from '@/lib/utils';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { checkRecordOwnership } from '@/lib/rbac';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Permissions } from '@/consts/permissions';
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

const FAULT_FORM_ID = 'maintenance.faults.fault';

export function FaultsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { hasFullAccess, permissionIndex } = useRoleAccess();

  // Permission levels for row-level "OWN" checks
  const editLevel = hasFullAccess ? 'ALL' : permissionIndex.getEditLevel(FAULT_FORM_ID);
  const archiveLevel = hasFullAccess ? 'ALL' : permissionIndex.getArchiveLevel(FAULT_FORM_ID);
  const deleteLevel = hasFullAccess ? 'ALL' : permissionIndex.getDeleteLevel(FAULT_FORM_ID);
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

  // Archive state
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingFault, setArchivingFault] = useState<FaultRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Delete state
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
      if (showArchived) params.set('showArchived', 'true');

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
  }, [rowsPerPage, debouncedSearch, activeTab, filters, showArchived]);

  useEffect(() => { fetchFaults(1); }, [fetchFaults]);

  // Panel handlers
  const handleOpenCreate = () => { setEditingFault(null); setPanelMode('create'); setPanelOpen(true); };
  const handleOpenEdit = (fault: FaultRow) => { setEditingFault(fault); setPanelMode('edit'); setPanelOpen(true); };
  const handleClosePanel = () => { setPanelOpen(false); setEditingFault(null); };
  const handleSaved = () => {
    handleClosePanel();
    fetchFaults(panelMode === 'create' ? 1 : pagination.page);
  };

  // Work order panel — raise a WO for a fault
  const handleOpenCreateWO = (fault: FaultRow) => {
    setWoFault(fault);
    setWoPanelOpen(true);
  };
  const handleCloseWOPanel = () => { setWoPanelOpen(false); setWoFault(null); };
  const handleWOSaved = () => {
    handleCloseWOPanel();
    fetchFaults(pagination.page);
  };

  // Archive
  const handleOpenArchive = (fault: FaultRow) => {
    setArchivingFault(fault);
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    if (!archivingFault) return;
    setArchiving(true);
    try {
      await axios.patch(`/api/faults/${archivingFault.id}/archive`, { archived: !showArchived }, { withCredentials: true });
      setArchiveDialogOpen(false);
      setArchivingFault(null);
      fetchFaults(pagination.page);
    } catch (err) {
      console.error('Failed to archive/unarchive fault:', err);
    } finally {
      setArchiving(false);
    }
  };

  // Delete handlers
  const handleOpenDelete = (fault: FaultRow) => {
    setDeletingFault(fault);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingFault) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/faults/${deletingFault.id}`, { withCredentials: true });
      setDeleteDialogOpen(false);
      setDeletingFault(null);
      fetchFaults(pagination.page);
    } catch (err) {
      console.error('Failed to delete fault:', err);
    } finally {
      setDeleting(false);
    }
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
          {formatDate(fault.reportedAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (fault) => (
        <RowActions>
          {showArchived ? (
            <>
              {checkRecordOwnership(archiveLevel, fault.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.maintenance.faults.form.archive}>
                  <RowActionButton label="Unarchive" icon={<ArchiveRestore />} onClick={() => handleOpenArchive(fault)} />
                </PermissionGuard>
              )}
              {checkRecordOwnership(deleteLevel, fault.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.maintenance.faults.form.delete}>
                  <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(fault)} />
                </PermissionGuard>
              )}
            </>
          ) : (
            <>
              {fault.workOrderNumber ? (
                <Badge variant="outline" className="font-mono text-xs gap-1">
                  <Wrench className="h-3 w-3" />{fault.workOrderNumber}
                </Badge>
              ) : (
                <PermissionGuard permission={Permissions.maintenance.workOrders.form.create}>
                  <RowActionButton
                    label="Create work order"
                    icon={<Wrench />}
                    onClick={() => handleOpenCreateWO(fault)}
                  />
                </PermissionGuard>
              )}
              <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => router.push(`/maintenance/faults/${fault.id}`)} />
              {checkRecordOwnership(editLevel, fault.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.maintenance.faults.form.edit}>
                  <RowActionButton label="Edit" icon={<Edit />} onClick={() => handleOpenEdit(fault)} />
                </PermissionGuard>
              )}
              {checkRecordOwnership(archiveLevel, fault.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.maintenance.faults.form.archive}>
                  <RowActionButton label="Archive" tone="destructive" icon={<Archive />} onClick={() => handleOpenArchive(fault)} />
                </PermissionGuard>
              )}
            </>
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="relative flex h-full">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader title="Faults" description="Log, prioritize, and resolve asset faults and breakdowns" count={pagination.total}>
          <PermissionGuard permission={Permissions.maintenance.faults.form.create}>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" />
              Create Fault
            </Button>
          </PermissionGuard>
        </PageHeader>

        {/* Status Tabs */}
        <div className="px-6 pb-4 flex items-center gap-4">
          <FilterTabs
            value={activeTab}
            onChange={setActiveTab}
            tabs={FAULT_STATUS_TABS.map((tab) => ({ value: tab.key, label: tab.label }))}
          />
          <ShowArchivedToggle checked={showArchived} onCheckedChange={setShowArchived} />
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
            onRowClick={showArchived ? undefined : (fault) => router.push(`/maintenance/faults/${fault.id}`)}
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

      {/* Archive Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={archivingFault?.title}
        action={showArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingFault?.title}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

