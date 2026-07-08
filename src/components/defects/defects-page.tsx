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
  Zap,
  Wrench,
  ClipboardCheck,
  PenLine,
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
import { cn, formatDate } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import { useSyncSubmissions } from '@/hooks/use-sync-submissions';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { checkRecordOwnership } from '@/lib/rbac';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Permissions } from '@/consts/permissions';
import { DefectForm } from './defect-form';
import { WorkOrderForm } from '@/components/work-orders/work-order-form';
import type { DefectRow, Pagination } from './types';
import {
  DEFECT_STATUS_TABS,
  STATUS_BADGE_VARIANT,
  STATUS_DISPLAY_NAME,
  SEVERITY_BADGE_CLASSES,
  SEVERITY_DISPLAY_NAME,
} from './types';

const DEFECT_FORM_ID = 'maintenance.defects.defect';

export function DefectsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { hasFullAccess, permissionIndex } = useRoleAccess();

  // Permission levels for row-level "OWN" checks
  const editLevel = hasFullAccess ? 'ALL' : permissionIndex.getEditLevel(DEFECT_FORM_ID);
  const archiveLevel = hasFullAccess ? 'ALL' : permissionIndex.getArchiveLevel(DEFECT_FORM_ID);
  const deleteLevel = hasFullAccess ? 'ALL' : permissionIndex.getDeleteLevel(DEFECT_FORM_ID);

  const [defects, setDefects] = useState<DefectRow[]>([]);
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

  // Filter definitions for toolbar Filters tab
  const defectFilterDefs: DataTableFilterDef[] = useMemo(() => [
    ...(teams.length > 0
      ? [{
          columnKey: 'teamId',
          label: 'Team',
          type: 'select' as const,
          options: teams.map((t) => ({ label: t.name, value: t.id })),
        }]
      : []),
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
    {
      columnKey: 'source',
      label: 'Type',
      type: 'select',
      options: [
        { label: 'Inspection', value: 'prestart_inspection' },
        { label: 'Fault', value: 'fault' },
        { label: 'Manual', value: 'manual' },
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
  const [editingDefect, setEditingDefect] = useState<DefectRow | null>(null);

  // Work-order panel state (raise a correction WO from a defect)
  const [woPanelOpen, setWoPanelOpen] = useState(false);
  const [woDefect, setWoDefect] = useState<DefectRow | null>(null);

  // Archive state
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingDefect, setArchivingDefect] = useState<DefectRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingDefect, setDeletingDefect] = useState<DefectRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Row selection
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Bulk status update
  const handleBulkStatusUpdate = async (newStatus: string) => {
    if (selectedKeys.size === 0) return;
    setUpdatingStatus(true);
    try {
      await axios.put('/api/defects/bulk-status', {
        ids: Array.from(selectedKeys),
        status: newStatus,
      }, { withCredentials: true });
      setSelectedKeys(new Set());
      fetchDefects(pagination.page);
    } catch {
      // Silent
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Fetch defects
  const fetchDefects = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (activeTab !== 'all') params.set('status', activeTab);
      if (showArchived) params.set('showArchived', 'true');

      const selectedPriorities = (filters.priority as string[]) ?? [];
      if (selectedPriorities.length > 0) params.set('priority', selectedPriorities[0]);

      const selectedTeams = (filters.teamId as string[]) ?? [];
      if (selectedTeams.length > 0) params.set('teamId', selectedTeams[0]);

      const selectedSource = (filters.source as string[]) ?? [];
      if (selectedSource.length > 0) params.set('source', selectedSource[0]);

      const res = await axios.get(`/api/defects?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setDefects(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
      setSelectedKeys(new Set());
    } catch {
      setDefects([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage, debouncedSearch, activeTab, filters, showArchived]);

  useEffect(() => { fetchDefects(1); }, [fetchDefects]);

  // Auto-pull new inspection submissions so freshly-failed items appear as defects
  // without the manual Sync button.
  useSyncSubmissions(() => fetchDefects(pagination.page));

  // Panel handlers
  const handleOpenCreate = () => { setEditingDefect(null); setPanelMode('create'); setPanelOpen(true); };
  const handleOpenEdit = (defect: DefectRow) => { setEditingDefect(defect); setPanelMode('edit'); setPanelOpen(true); };
  const handleClosePanel = () => { setPanelOpen(false); setEditingDefect(null); };
  const handleSaved = () => {
    handleClosePanel();
    fetchDefects(panelMode === 'create' ? 1 : pagination.page);
  };

  // Navigate to detail page
  const handleOpenView = (defect: DefectRow) => { router.push(`/maintenance/defects/${defect.id}`); };

  // Work order panel — raise a correction WO for a defect
  const handleOpenCreateWO = (defect: DefectRow) => {
    setWoDefect(defect);
    setWoPanelOpen(true);
  };
  const handleCloseWOPanel = () => { setWoPanelOpen(false); setWoDefect(null); };
  const handleWOSaved = () => {
    handleCloseWOPanel();
    fetchDefects(pagination.page); // defect moves to In Progress + gets WO #
  };

  // Archive
  const handleOpenArchive = (defect: DefectRow) => {
    setArchivingDefect(defect);
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    if (!archivingDefect) return;
    setArchiving(true);
    try {
      await axios.patch(`/api/defects/${archivingDefect.id}/archive`, { archived: !showArchived }, { withCredentials: true });
      setArchiveDialogOpen(false);
      setArchivingDefect(null);
      fetchDefects(pagination.page);
    } catch (err) {
      console.error('Failed to archive/unarchive defect:', err);
    } finally {
      setArchiving(false);
    }
  };

  // Delete
  const handleOpenDelete = (defect: DefectRow) => { setDeletingDefect(defect); setDeleteDialogOpen(true); };
  const handleDelete = async () => {
    if (!deletingDefect) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/defects/${deletingDefect.id}`, { withCredentials: true });
      setDeleteDialogOpen(false); setDeletingDefect(null);
      fetchDefects(pagination.page);
    } catch { /* silent */ } finally { setDeleting(false); }
  };

  // Column definitions
  const defectColumns: DataTableColumn<DefectRow>[] = [
    {
      key: 'defectNumber',
      header: 'Defect #',
      label: 'Defect number',
      pinned: true,
      sortable: true,
      render: (defect) => {
        const sourceConfig = defect.source === 'prestart_inspection'
          ? { icon: <ClipboardCheck className="h-4 w-4" />, label: 'From Inspection', classes: 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' }
          : defect.source === 'fault'
            ? { icon: <Zap className="h-4 w-4" />, label: 'From Fault', classes: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' }
            : { icon: <PenLine className="h-4 w-4" />, label: 'Manually Created', classes: 'bg-destructive/10 text-destructive' };
        return (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    sourceConfig.classes,
                  )}>
                    {sourceConfig.icon}
                  </div>
                  <span className="font-medium text-foreground font-mono text-sm">{defect.defectNumber}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {sourceConfig.label}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      label: 'Status',
      pinned: true,
      sortable: true,
      render: (defect) => (
        <Badge variant={STATUS_BADGE_VARIANT[defect.status] || 'secondary'}>
          {STATUS_DISPLAY_NAME[defect.status] || defect.status}
        </Badge>
      ),
    },
    {
      key: 'name',
      header: 'Defect Name',
      label: 'Defect Name',
      sortable: true,
      render: (defect) => {
        const sourceBadge = defect.source === 'prestart_inspection'
          ? { label: 'Inspection', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' }
          : defect.source === 'fault'
            ? { label: 'Fault', classes: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' }
            : { label: 'Manual', classes: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300' };
        return (
          <div className="flex items-center gap-2">
            <span className="text-foreground truncate">{defect.name}</span>
            <span className={cn(
              'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase shrink-0',
              sourceBadge.classes,
            )}>
              {sourceBadge.label}
            </span>
          </div>
        );
      },
    },
    {
      key: 'assetName',
      header: 'Asset',
      label: 'Asset',
      sortable: true,
      render: (defect) => (
        <span className="text-foreground">{defect.assetName || '—'}</span>
      ),
    },
    {
      key: 'driverName',
      header: 'Driver',
      label: 'Driver',
      sortable: true,
      render: (defect) => (
        <span className="text-muted-foreground">{defect.driverName || '—'}</span>
      ),
    },
    {
      key: 'priority',
      header: 'Severity',
      label: 'Severity',
      sortable: true,
      render: (defect) => (
        <span className={cn(
          'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
          SEVERITY_BADGE_CLASSES[defect.priority] || 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
        )}>
          {SEVERITY_DISPLAY_NAME[defect.priority] || defect.priority}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      label: 'Date',
      sortable: true,
      sortValue: (defect) => defect.date ? new Date(defect.date).getTime() : null,
      render: (defect) => (
        <span className="text-muted-foreground text-xs">
          {formatDate(defect.date)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (defect) => (
        <RowActions>
          {showArchived ? (
            <>
              {checkRecordOwnership(archiveLevel, defect.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.maintenance.defects.form.archive}>
                  <RowActionButton label="Unarchive" icon={<ArchiveRestore />} onClick={() => handleOpenArchive(defect)} />
                </PermissionGuard>
              )}
              {checkRecordOwnership(deleteLevel, defect.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.maintenance.defects.form.delete}>
                  <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(defect)} />
                </PermissionGuard>
              )}
            </>
          ) : (
            <>
              {defect.workOrderNumber ? (
                <Badge variant="outline" className="font-mono text-xs gap-1">
                  <Wrench className="h-3 w-3" />{defect.workOrderNumber}
                </Badge>
              ) : (
                <PermissionGuard permission={Permissions.maintenance.workOrders.form.create}>
                  <RowActionButton
                    label="Create work order"
                    icon={<Wrench />}
                    onClick={() => handleOpenCreateWO(defect)}
                  />
                </PermissionGuard>
              )}
              <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => handleOpenView(defect)} />
              {checkRecordOwnership(editLevel, defect.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.maintenance.defects.form.edit}>
                  <RowActionButton label="Edit" icon={<Edit />} onClick={() => handleOpenEdit(defect)} />
                </PermissionGuard>
              )}
              {checkRecordOwnership(archiveLevel, defect.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.maintenance.defects.form.archive}>
                  <RowActionButton label="Archive" tone="destructive" icon={<Archive />} onClick={() => handleOpenArchive(defect)} />
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
        <PageHeader title="Defects" description="Track inspection defects from discovery through to resolution" count={pagination.total}>
          <PermissionGuard permission={Permissions.maintenance.defects.form.create}>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" />
              Create Defect
            </Button>
          </PermissionGuard>
        </PageHeader>

        {/* Status Tabs */}
        <div className="px-6 pb-4 flex items-center gap-4">
          <FilterTabs
            value={activeTab}
            onChange={setActiveTab}
            tabs={DEFECT_STATUS_TABS.map((tab) => ({ value: tab.key, label: tab.label }))}
          />
          <ShowArchivedToggle checked={showArchived} onCheckedChange={setShowArchived} />
        </div>

        <div className="flex-1 overflow-auto px-6 pb-6">
          <DataTableToolbar
            columns={defectColumns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
            filterDefs={defectFilterDefs}
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
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="corrected">Corrected</SelectItem>
                  <SelectItem value="no_correction_needed">No Correction Needed</SelectItem>
                </SelectContent>
              </Select>
            }
            searchNode={
              <SearchInput value={search} onChange={setSearch} placeholder="Search defects..." />
            }
          />
          <DataTable<DefectRow>
            columns={defectColumns}
            data={defects}
            pagination={pagination}
            loading={loading}
            rowsPerPage={rowsPerPage}
            onPageChange={fetchDefects}
            onRowsPerPageChange={setRowsPerPage}
            onRowClick={showArchived ? undefined : handleOpenView}
            rowKey={(d) => d.id}
            density={density}
            hiddenColumnKeys={hiddenColumnKeys}
            selectable
            selectedKeys={selectedKeys}
            onSelectedKeysChange={setSelectedKeys}
            emptyMessage={
              debouncedSearch
                ? 'No defects match your search.'
                : activeTab !== 'all'
                  ? `No ${STATUS_DISPLAY_NAME[activeTab] || activeTab} defects.`
                  : 'No defects yet. Click "Create Defect" to create one.'
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

      {/* Right Panel — Defect Form (slide-out) */}
      <div className={cn(
        'fixed top-0 right-0 z-50 h-full w-[560px] border-l border-border bg-background transition-transform duration-300',
        panelOpen ? 'translate-x-0' : 'translate-x-full',
      )}>
        {panelOpen && (
          <DefectForm
            mode={panelMode}
            defect={editingDefect}
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

      {/* Right Panel — Work Order Form (raise correction WO from a defect) */}
      <div className={cn(
        'fixed top-0 right-0 z-50 h-full w-[560px] border-l border-border bg-background transition-transform duration-300',
        woPanelOpen ? 'translate-x-0' : 'translate-x-full',
      )}>
        {woPanelOpen && woDefect && (
          <WorkOrderForm
            mode="create"
            source="defect"
            initialAssetId={woDefect.assetId}
            initialDefectIds={[woDefect.id]}
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
        itemName={archivingDefect?.defectNumber}
        action={showArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingDefect?.defectNumber}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

