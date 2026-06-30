'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Plus,
  MoreHorizontal,
  Users,
  ClipboardList,
  ClipboardCheck,
  KeyRound,
  Power,
  Trash2,
} from 'lucide-react';
import { InspectFormPickerDialog } from '@/components/inspections/inspect-button';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn, type DataTableFilterDef } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable, applyTableFilters } from '@/hooks/use-data-table';
import { ASSET_STATUS_CONFIG, type AssetStatus } from '@/constants/assets';
import type { AssetRow, TeamOption, Pagination } from './types';

const STAT_CARDS = [
  { label: 'Total Assets', key: 'total' },
  { label: 'Assets Inspected', key: 'inspected' },
  { label: 'Assets Followed', key: 'followed' },
  { label: 'Assets with Active Defects', key: 'defects' },
] as const;

export function AssetTable() {
  const router = useRouter();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 25,
    total: 0,
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [inspectAssetId, setInspectAssetId] = useState<string | null>(null);

  // Table features: filters, column visibility, density
  const {
    hiddenColumnKeys, setHiddenColumnKeys,
    density, setDensity,
    filters, setFilter, clearFilters,
  } = useDataTable();

  const assetFilterDefs: DataTableFilterDef[] = useMemo(() => [
    {
      columnKey: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { label: 'In Service', value: 'in_service' },
        { label: 'Out of Service', value: 'out_of_service' },
      ],
    },
    {
      columnKey: 'subscriptionType',
      label: 'Subscription Type',
      type: 'select',
      options: [
        { label: 'Owned', value: 'owned' },
        { label: 'Leased', value: 'leased' },
        { label: 'Rented', value: 'rented' },
        { label: 'Financed', value: 'financed' },
      ],
    },
  ], []);

  const filteredAssets = useMemo(
    () => applyTableFilters(assets, filters, assetFilterDefs),
    [assets, filters, assetFilterDefs],
  );

  // Change Team dialog state
  const [changeTeamOpen, setChangeTeamOpen] = useState(false);
  const [changeTeamAsset, setChangeTeamAsset] = useState<AssetRow | null>(null);
  const [teamsList, setTeamsList] = useState<TeamOption[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [savingTeam, setSavingTeam] = useState(false);

  const fetchAssets = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await axios.get(`/api/assets?${params.toString()}`, {
        withCredentials: true,
      });
      const data = res.data.data;
      setAssets(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch assets:', err);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, rowsPerPage]);

  useEffect(() => {
    fetchAssets(1);
  }, [fetchAssets]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this asset?')) return;
    try {
      await axios.delete(`/api/assets/${id}`, { withCredentials: true });
      fetchAssets(pagination.page);
    } catch (err) {
      console.error('Failed to delete asset:', err);
    }
  };

  // ── Change Team handlers ──
  const fetchTeams = useCallback(async () => {
    try {
      setTeamsLoading(true);
      const res = await axios.get('/api/teams?limit=100', { withCredentials: true });
      setTeamsList(res.data.data?.items || []);
    } catch {
      setTeamsList([]);
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  const handleOpenChangeTeam = (asset: AssetRow) => {
    setChangeTeamAsset(asset);
    // Pre-select the first assigned team if any
    setSelectedTeamId(asset.teamIds?.[0] || null);
    setChangeTeamOpen(true);
    fetchTeams();
  };

  const handleSaveTeam = async () => {
    if (!changeTeamAsset) return;
    setSavingTeam(true);
    try {
      await axios.put(
        `/api/assets/${changeTeamAsset.id}`,
        { teamIds: selectedTeamId ? [selectedTeamId] : [] },
        { withCredentials: true },
      );
      setChangeTeamOpen(false);
      setChangeTeamAsset(null);
      fetchAssets(pagination.page);
    } catch (err) {
      console.error('Failed to change team:', err);
    } finally {
      setSavingTeam(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const normalized = currentStatus === 'active' || currentStatus === 'in_service' ? 'in_service' : 'out_of_service';
    const newStatus = normalized === 'in_service' ? 'out_of_service' : 'in_service';
    try {
      await axios.put(`/api/assets/${id}`, { status: newStatus }, { withCredentials: true });
      fetchAssets(pagination.page);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  /** Normalize legacy 'active' status to 'in_service'. */
  const normalizeStatus = (status: string): string => {
    if (status === 'active') return 'in_service';
    return status;
  };

  const getStatusBadge = (status: string) => {
    const normalized = normalizeStatus(status);
    const config = ASSET_STATUS_CONFIG[normalized as AssetStatus];
    if (!config) return <Badge variant="outline">{status}</Badge>;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // ── Column definitions ──
  const assetColumns: DataTableColumn<AssetRow>[] = [
    {
      key: 'name',
      header: 'Name',
      label: 'Name',
      pinned: true,
      render: (asset) => (
        <span className="font-medium text-foreground">{asset.name}</span>
      ),
    },
    {
      key: 'assetNumber',
      header: 'Asset #',
      label: 'Asset Number',
      pinned: true,
      render: (asset) => (
        <span className="text-muted-foreground">{asset.assetNumber || '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      label: 'Status',
      render: (asset) => getStatusBadge(asset.status),
    },
    {
      key: 'assetTypeName',
      header: 'Asset Type',
      label: 'Asset Type',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.assetTypeName || '—'}</span>
      ),
    },
    {
      key: 'makeModel',
      header: 'Make / Model',
      label: 'Make / Model',
      render: (asset) => (
        <span className="text-muted-foreground">
          {[asset.make, asset.model].filter(Boolean).join(' ') || '—'}
        </span>
      ),
    },
    {
      key: 'year',
      header: 'Year',
      label: 'Year',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.year || '—'}</span>
      ),
    },
    {
      key: 'licensePlate',
      header: 'License',
      label: 'License',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.licensePlate || '—'}</span>
      ),
    },
    {
      key: 'currentOdometer',
      header: 'Mileage',
      label: 'Mileage',
      render: (asset) => (
        <span className="text-muted-foreground">
          {asset.currentOdometer != null ? asset.currentOdometer.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'vin',
      header: 'VIN',
      label: 'VIN',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.vin || '—'}</span>
      ),
    },
    {
      key: 'color',
      header: 'Color',
      label: 'Color',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.color || '—'}</span>
      ),
    },
    {
      key: 'tireSize',
      header: 'Tire Size',
      label: 'Tire Size',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.tireSize || '—'}</span>
      ),
    },
    {
      key: 'teamNames',
      header: 'Team',
      label: 'Team',
      render: (asset) => (
        <span className="text-muted-foreground">
          {asset.teamNames && asset.teamNames.length > 0 ? asset.teamNames.join(', ') : '—'}
        </span>
      ),
    },
    {
      key: 'estimatedCost',
      header: 'Est. Cost',
      label: 'Estimated Cost',
      render: (asset) => (
        <span className="text-muted-foreground">
          {asset.estimatedCost != null
            ? `${asset.currencyCode || 'USD'} ${asset.estimatedCost.toLocaleString()}`
            : '—'}
        </span>
      ),
    },
    {
      key: 'currentEngineHours',
      header: 'Engine Hrs',
      label: 'Engine Hours',
      render: (asset) => (
        <span className="text-muted-foreground">
          {asset.currentEngineHours != null ? asset.currentEngineHours.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'assetSubtype',
      header: 'Subtype',
      label: 'Asset Subtype',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.assetSubtype || '—'}</span>
      ),
    },
    {
      key: 'subscriptionType',
      header: 'Subscription',
      label: 'Subscription Type',
      render: (asset) => (
        <span className="text-muted-foreground capitalize">{asset.subscriptionType || '—'}</span>
      ),
    },
    {
      key: 'lastServiceDate',
      header: 'Last Service',
      label: 'Last Service Date',
      render: (asset) => (
        <span className="text-muted-foreground">
          {asset.lastServiceDate
            ? new Date(asset.lastServiceDate).toLocaleDateString()
            : '—'}
        </span>
      ),
    },
    {
      key: 'lastServiceMileage',
      header: 'Last Svc Mileage',
      label: 'Last Service Mileage',
      render: (asset) => (
        <span className="text-muted-foreground">
          {asset.lastServiceMileage != null ? asset.lastServiceMileage.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'lastServiceEngineHours',
      header: 'Last Svc Engine Hrs',
      label: 'Last Service Engine Hours',
      render: (asset) => (
        <span className="text-muted-foreground">
          {asset.lastServiceEngineHours != null ? asset.lastServiceEngineHours.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
      label: 'Notes',
      render: (asset) =>
        asset.notes ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground truncate max-w-[200px] inline-block cursor-default">
                  {asset.notes}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap">
                {asset.notes}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (asset) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setInspectAssetId(asset.id);
              }}
            >
              <ClipboardCheck className="h-4 w-4" />
              Inspect
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleOpenChangeTeam(asset);
              }}
            >
              <Users className="h-4 w-4" />
              Change Team
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <ClipboardList className="h-4 w-4" />
              Assign Forms
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <KeyRound className="h-4 w-4" />
              Driver Access
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleToggleStatus(asset.id, asset.status);
              }}
            >
              <Power className="h-4 w-4" />
              {normalizeStatus(asset.status) === 'in_service'
                ? 'Mark as Out of Service'
                : 'Mark as In Service'}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(asset.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="p-6">
      <InspectFormPickerDialog
        open={!!inspectAssetId}
        assetId={inspectAssetId ?? ''}
        onOpenChange={(o) => { if (!o) setInspectAssetId(null); }}
      />
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Assets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your fleet vehicles and equipment
          </p>
        </div>
        <Button onClick={() => router.push('/assets/new')}>
          <Plus className="h-4 w-4" />
          Add Asset
        </Button>
      </div>

      {/* Summary Cards + Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STAT_CARDS.map((card) => (
            <div
              key={card.key}
              className="rounded-lg border bg-card px-3 py-2 shadow-sm"
            >
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-lg font-semibold text-foreground">
                {card.key === 'total' ? pagination.total : 0}
              </p>
            </div>
          ))}
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search assets..."
          className="max-w-sm w-full ml-auto"
        />
      </div>

      {/* Toolbar */}
      <DataTableToolbar
        columns={assetColumns}
        hiddenColumnKeys={hiddenColumnKeys}
        onHiddenColumnKeysChange={setHiddenColumnKeys}
        density={density}
        onDensityChange={setDensity}
        filterDefs={assetFilterDefs}
        filters={filters}
        onFilterChange={setFilter}
        onFiltersClear={clearFilters}
      />

      {/* Table */}
      <DataTable<AssetRow>
        columns={assetColumns}
        data={filteredAssets}
        pagination={pagination}
        loading={loading}
        rowsPerPage={rowsPerPage}
        onPageChange={fetchAssets}
        onRowsPerPageChange={setRowsPerPage}
        onRowClick={(asset) => router.push(`/assets/${asset.id}`)}
        rowKey={(a) => a.id}
        density={density}
        hiddenColumnKeys={hiddenColumnKeys}
        emptyMessage={
          debouncedSearch
            ? 'No assets match your search'
            : 'No assets yet. Click "Add Asset" to create one.'
        }
      />

      {/* Change Team Dialog */}
      <Dialog open={changeTeamOpen} onOpenChange={setChangeTeamOpen}>
        <DialogContent className="sm:max-w-110">
          <DialogHeader>
            <DialogTitle>Change Team</DialogTitle>
            <DialogDescription>
              Select a team for &quot;{changeTeamAsset?.name}&quot;.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto rounded-lg border">
            {teamsLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : teamsList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No teams available
              </p>
            ) : (
              <div className="flex flex-col">
                {/* No Team option */}
                <button
                  type="button"
                  onClick={() => setSelectedTeamId(null)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 text-sm text-left border-b last:border-0 transition-colors',
                    selectedTeamId === null
                      ? 'bg-primary/5'
                      : 'hover:bg-muted/50',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      selectedTeamId === null
                        ? 'border-primary'
                        : 'border-muted-foreground/40',
                    )}
                  >
                    {selectedTeamId === null && (
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </span>
                  <span className="text-muted-foreground italic">No Team</span>
                </button>
                {teamsList.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => setSelectedTeamId(team.id)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 text-sm text-left border-b last:border-0 transition-colors',
                      selectedTeamId === team.id
                        ? 'bg-primary/5'
                        : 'hover:bg-muted/50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                        selectedTeamId === team.id
                          ? 'border-primary'
                          : 'border-muted-foreground/40',
                      )}
                    >
                      {selectedTeamId === team.id && (
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </span>
                    <span className="font-medium text-foreground">{team.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeTeamOpen(false)} disabled={savingTeam}>
              Cancel
            </Button>
            <Button onClick={handleSaveTeam} disabled={savingTeam}>
              {savingTeam ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
