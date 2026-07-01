'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  AlertTriangle,
  X,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
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
import { useSyncSubmissions } from '@/hooks/use-sync-submissions';
import { DefectForm } from './defect-form';
import { WorkOrderForm } from '@/components/work-orders/work-order-form';
import type { DefectRow, Pagination } from './types';
import {
  DEFECT_STATUS_TABS,
  STATUS_BADGE_VARIANT,
  STATUS_DISPLAY_NAME,
  PRIORITY_BADGE_VARIANT,
  PRIORITY_DISPLAY_NAME,
  SEVERITY_DISPLAY_NAME,
} from './types';

export function DefectsPage() {
  const [defects, setDefects] = useState<DefectRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [activeTab, setActiveTab] = useState('all');

  // Filters
  const [filterTeamId, setFilterTeamId] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);

  // Fetch teams for filter dropdown
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

  // Table features
  const {
    hiddenColumnKeys, setHiddenColumnKeys,
    density, setDensity,
  } = useDataTable();

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create');
  const [editingDefect, setEditingDefect] = useState<DefectRow | null>(null);

  // Work-order panel state (raise a correction WO from a defect)
  const [woPanelOpen, setWoPanelOpen] = useState(false);
  const [woDefect, setWoDefect] = useState<DefectRow | null>(null);

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewDefect, setViewDefect] = useState<DefectRow | null>(null);

  // Delete dialog
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
      if (filterPriority) params.set('priority', filterPriority);
      if (filterSeverity) params.set('severity', filterSeverity);
      if (filterTeamId) params.set('teamId', filterTeamId);

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
  }, [rowsPerPage, debouncedSearch, activeTab, filterPriority, filterSeverity, filterTeamId]);

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

  // View dialog
  const handleOpenView = (defect: DefectRow) => { setViewDefect(defect); setViewDialogOpen(true); };

  // Work order panel — raise a correction WO for a defect
  const handleOpenCreateWO = (defect: DefectRow) => {
    setViewDialogOpen(false);
    setWoDefect(defect);
    setWoPanelOpen(true);
  };
  const handleCloseWOPanel = () => { setWoPanelOpen(false); setWoDefect(null); };
  const handleWOSaved = () => {
    handleCloseWOPanel();
    fetchDefects(pagination.page); // defect moves to In Progress + gets WO #
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
      render: (defect) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground font-mono text-sm">{defect.defectNumber}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      label: 'Status',
      pinned: true,
      render: (defect) => (
        <Badge variant={STATUS_BADGE_VARIANT[defect.status] || 'secondary'}>
          {STATUS_DISPLAY_NAME[defect.status] || defect.status}
        </Badge>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      label: 'Name',
      render: (defect) => (
        <span className="text-foreground">{defect.name}</span>
      ),
    },
    {
      key: 'assetName',
      header: 'Asset',
      label: 'Asset',
      render: (defect) => (
        <span className="text-foreground">{defect.assetName || '—'}</span>
      ),
    },
    {
      key: 'driverName',
      header: 'Operator',
      label: 'Operator',
      render: (defect) => (
        <span className="text-muted-foreground">{defect.driverName || '—'}</span>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      label: 'Priority',
      render: (defect) => (
        <Badge variant={PRIORITY_BADGE_VARIANT[defect.priority] || 'secondary'}>
          {PRIORITY_DISPLAY_NAME[defect.priority] || defect.priority}
        </Badge>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      label: 'Severity',
      render: (defect) => (
        <span className="text-muted-foreground">
          {SEVERITY_DISPLAY_NAME[defect.severity] || defect.severity}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      label: 'Date',
      render: (defect) => (
        <span className="text-muted-foreground text-xs">
          {defect.date ? new Date(defect.date).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (defect) => (
        <RowActions>
          {defect.workOrderNumber ? (
            <Badge variant="outline" className="font-mono text-xs gap-1">
              <Wrench className="h-3 w-3" />{defect.workOrderNumber}
            </Badge>
          ) : (
            <RowActionButton
              label="Create work order"
              icon={<Wrench />}
              onClick={() => handleOpenCreateWO(defect)}
            />
          )}
          <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => handleOpenView(defect)} />
          <RowActionButton label="Edit" icon={<Pencil />} onClick={() => handleOpenEdit(defect)} />
          <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(defect)} />
        </RowActions>
      ),
    },
  ];

  return (
    <div className="relative flex h-full">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader title="Defects" count={pagination.total}>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Report Defect
          </Button>
        </PageHeader>

        {/* Status Tabs */}
        <div className="px-6 pb-4">
          <FilterTabs
            value={activeTab}
            onChange={setActiveTab}
            tabs={DEFECT_STATUS_TABS.map((tab) => ({ value: tab.key, label: tab.label }))}
          />
        </div>

        {/* Filters row */}
        <div className="px-6 pb-4 flex items-center gap-3 flex-wrap">
          {/* Team filter */}
          <div className="relative">
            <Select value={filterTeamId} onValueChange={setFilterTeamId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filterTeamId && (
              <button
                type="button"
                onClick={() => setFilterTeamId('')}
                className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 rounded-sm hover:bg-muted"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Priority filter */}
          <div className="relative">
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            {filterPriority && (
              <button
                type="button"
                onClick={() => setFilterPriority('')}
                className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 rounded-sm hover:bg-muted"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Defect Type (Severity) filter */}
          <div className="relative">
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="All Defect Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="non_critical">Non-Critical</SelectItem>
              </SelectContent>
            </Select>
            {filterSeverity && (
              <button
                type="button"
                onClick={() => setFilterSeverity('')}
                className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 rounded-sm hover:bg-muted"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Clear all filters */}
          {(filterTeamId || filterPriority || filterSeverity) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFilterTeamId(''); setFilterPriority(''); setFilterSeverity(''); }}
              className="text-muted-foreground"
            >
              Clear filters
            </Button>
          )}
        </div>

        <div className="px-6 pb-4 flex items-center gap-3">
          <div className="flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Search defects..." />
          </div>
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
        </div>

        <div className="flex-1 overflow-auto px-6 pb-6">
          <DataTableToolbar
            columns={defectColumns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
          />
          <DataTable<DefectRow>
            columns={defectColumns}
            data={defects}
            pagination={pagination}
            loading={loading}
            rowsPerPage={rowsPerPage}
            onPageChange={fetchDefects}
            onRowsPerPageChange={setRowsPerPage}
            onRowClick={handleOpenView}
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
                  : 'No defects yet. Click "Report Defect" to create one.'
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

      {/* View Defect Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewDefect?.defectNumber || 'Defect Details'}</DialogTitle>
            <DialogDescription>Defect overview.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {viewDefect && <ViewDefectContent defect={viewDefect} />}
          </div>
          <DialogFooter>
            {viewDefect && !viewDefect.workOrderNumber && (
              <Button onClick={() => handleOpenCreateWO(viewDefect)}>
                <Wrench className="h-4 w-4 mr-1" /> Create Work Order
              </Button>
            )}
            <Button variant="outline" onClick={() => { setViewDialogOpen(false); if (viewDefect) handleOpenEdit(viewDefect); }}>
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
            <DialogTitle>Delete Defect</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingDefect?.defectNumber}&quot;? This action cannot be undone.
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

/** Read-only view of defect details. */
function ViewDefectContent({ defect }: { defect: DefectRow }) {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Overview</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <ViewField label="Defect Number" value={defect.defectNumber} />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <Badge variant={STATUS_BADGE_VARIANT[defect.status] || 'secondary'} className="mt-0.5">
                {STATUS_DISPLAY_NAME[defect.status] || defect.status}
              </Badge>
            </div>
          </div>
          <ViewField label="Name" value={defect.name} />
          <ViewField label="Date" value={defect.date ? new Date(defect.date).toLocaleDateString() : undefined} />
          <ViewField label="Comment" value={defect.comment} />
          {defect.workOrderNumber && (
            <ViewField label="Work Order" value={defect.workOrderNumber} />
          )}
        </div>
      </div>

      {/* Asset & Operator */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Asset & Operator</h3>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <ViewField label="Asset" value={defect.assetName} />
          <ViewField label="Operator" value={defect.driverName || undefined} />
        </div>
      </div>

      {/* Classification */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Classification</h3>
        <Separator className="mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Priority</p>
            <Badge variant={PRIORITY_BADGE_VARIANT[defect.priority] || 'secondary'} className="mt-0.5">
              {PRIORITY_DISPLAY_NAME[defect.priority] || defect.priority}
            </Badge>
          </div>
          <ViewField label="Severity" value={SEVERITY_DISPLAY_NAME[defect.severity] || defect.severity} />
        </div>
      </div>

      {/* Attachments */}
      {defect.attachments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Attachments</h3>
          <Separator className="mb-4" />
          <div className="space-y-2">
            {defect.attachments.map((att, i) => (
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
        <ViewField label="Created" value={new Date(defect.createdAt).toLocaleString()} />
      </div>
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
