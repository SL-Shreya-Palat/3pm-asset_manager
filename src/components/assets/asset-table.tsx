'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Plus,
  MoreHorizontal,
  Edit,
  Users,
  ClipboardList,
  ClipboardCheck,
  KeyRound,
  Power,
  Archive,
  ArchiveRestore,
  Trash2,
  Barcode,
  Eye,
  Layers,
  CheckCircle2,
  Wrench,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { InspectFormPickerDialog } from '@/components/inspections/inspect-button';
import { VinLookupDialog } from './vin-lookup-dialog';
import { GenerateBarcodeDialog } from './generate-barcode-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
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
import { cn, formatDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ShowArchivedToggle } from '@/components/ui/show-archived-toggle';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Permissions } from '@/consts/permissions';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable, applyTableFilters } from '@/hooks/use-data-table';
import { useConnection } from '@/hooks/use-connection';
import { SourceBadge, CommandManagedBanner } from '@/components/command/source-badge';
import { ASSET_STATUS_CONFIG, type AssetStatus } from '@/constants/assets';
import type { AssetRow, TeamOption, Pagination } from './types';

// ─── KPI tile ─────────────────────────────────────────────────────────────────
type Tone = 'primary' | 'emerald' | 'amber' | 'red';
const TONE: Record<Tone, { value: string; icon: string }> = {
  primary: { value: 'text-primary-600', icon: 'bg-primary-100 text-primary-600' },
  emerald: { value: 'text-emerald-600', icon: 'bg-emerald-100 text-emerald-600' },
  amber: { value: 'text-amber-600', icon: 'bg-amber-100 text-amber-600' },
  red: { value: 'text-red-600', icon: 'bg-red-100 text-red-600' },
};

function StatSeg({ tone, icon: Icon, label, value, loading }: {
  tone: Tone; icon: LucideIcon; label: string; value?: number; loading?: boolean;
}) {
  const t = TONE[tone];
  return (
    <div className="flex min-w-[140px] flex-1 items-center gap-3 px-4 py-3">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4', t.icon)}>
        <Icon />
      </span>
      <div className="min-w-0">
        {loading ? (
          <Skeleton className="h-5 w-8" />
        ) : (
          <p className={cn('text-xl font-bold leading-none tabular-nums', t.value)}>{value ?? 0}</p>
        )}
        <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

interface AssetSummary {
  total: number;
  inService: number;
  outOfService: number;
  nonCompliant: number;
}

export function AssetTable() {
  const router = useRouter();
  // Connected to Command → assets are mastered there (read-only, auto-synced).
  const { connected } = useConnection();
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
  const [vinDialogOpen, setVinDialogOpen] = useState(false);

  // Summary counts for stat ribbon
  const [summary, setSummary] = useState<AssetSummary | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await axios.get('/api/assets/summary', { withCredentials: true });
      setSummary(res.data.data);
    } catch {
      setSummary(null);
    }
  }, []);

  // Table features: filters, column visibility, density
  const {
    hiddenColumnKeys, setHiddenColumnKeys,
    density, setDensity,
    filters, setFilter, clearFilters,
  } = useDataTable();

  // Derive dynamic filter options from loaded assets
  const assetTypeOptions = useMemo(() => {
    const unique = [...new Set(assets.map((a) => a.assetTypeName).filter(Boolean))] as string[];
    return unique.sort().map((v) => ({ label: v, value: v }));
  }, [assets]);

  const teamOptions = useMemo(() => {
    const unique = [...new Set(assets.flatMap((a) => a.teamNames ?? []).filter(Boolean))];
    return unique.sort().map((v) => ({ label: v, value: v }));
  }, [assets]);

  const yearOptions = useMemo(() => {
    const unique = [...new Set(assets.map((a) => a.year).filter(Boolean))] as number[];
    return unique.sort((a, b) => b - a).map((v) => ({ label: String(v), value: String(v) }));
  }, [assets]);

  const assetFilterDefs: DataTableFilterDef[] = useMemo(() => [
    {
      columnKey: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { label: 'Active', value: 'in_service' },
        { label: 'Under Maintenance', value: 'out_of_service' },
      ],
    },
    ...(assetTypeOptions.length > 0
      ? [{
          columnKey: 'assetTypeName',
          label: 'Asset Type',
          type: 'select' as const,
          options: assetTypeOptions,
        }]
      : []),
    ...(teamOptions.length > 0
      ? [{
          columnKey: 'teamNames',
          label: 'Team',
          type: 'select' as const,
          options: teamOptions,
        }]
      : []),
    ...(yearOptions.length > 0
      ? [{
          columnKey: 'year',
          label: 'Year',
          type: 'select' as const,
          options: yearOptions,
        }]
      : []),
    {
      columnKey: 'fuelType',
      label: 'Fuel Type',
      type: 'select',
      options: [
        { label: 'Diesel', value: 'diesel' },
        { label: 'Petrol', value: 'petrol' },
        { label: 'Electric', value: 'electric' },
        { label: 'LPG', value: 'lpg' },
        { label: 'CNG', value: 'cng' },
        { label: 'Other', value: 'other' },
      ],
    },
    {
      columnKey: 'complianceStatus',
      label: 'Compliance',
      type: 'select',
      options: [
        { label: 'Expired', value: 'expired' },
        { label: 'Expiring Soon', value: 'expiring_soon' },
        { label: 'Valid', value: 'valid' },
        { label: 'No Documents', value: 'none' },
      ],
    },
  ], [assetTypeOptions, teamOptions, yearOptions]);

  const filteredAssets = useMemo(
    () => applyTableFilters(assets, filters, assetFilterDefs),
    [assets, filters, assetFilterDefs],
  );

  // Whether any filter currently has a value (drives the filtered header count).
  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v))),
    [filters],
  );

  // Change Team dialog state
  const [changeTeamOpen, setChangeTeamOpen] = useState(false);
  const [changeTeamAsset, setChangeTeamAsset] = useState<AssetRow | null>(null);
  const [teamsList, setTeamsList] = useState<TeamOption[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [savingTeam, setSavingTeam] = useState(false);

  // Assign Forms dialog state
  const [assignFormsOpen, setAssignFormsOpen] = useState(false);
  const [assignFormsAsset, setAssignFormsAsset] = useState<AssetRow | null>(null);
  const [formsList, setFormsList] = useState<{ id: string; title: string }[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [selectedFormIds, setSelectedFormIds] = useState<Set<string>>(new Set());
  const [savingForms, setSavingForms] = useState(false);

  // Driver Access dialog state
  const [driverAccessOpen, setDriverAccessOpen] = useState(false);
  const [driverAccessAsset, setDriverAccessAsset] = useState<AssetRow | null>(null);
  const [driversList, setDriversList] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set());
  const [savingDrivers, setSavingDrivers] = useState(false);

  // Archive state
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingAsset, setArchivingAsset] = useState<AssetRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAsset, setDeletingAsset] = useState<AssetRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Row selection & barcode dialog
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);

  const selectedAssets = useMemo(
    () => assets.filter((a) => selectedKeys.has(a.id)),
    [assets, selectedKeys],
  );

  const fetchAssets = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (showArchived) params.set('showArchived', 'true');

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
  }, [debouncedSearch, rowsPerPage, showArchived]);

  useEffect(() => {
    fetchAssets(1);
  }, [fetchAssets]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Archive handlers
  const handleOpenArchive = (asset: AssetRow) => {
    setArchivingAsset(asset);
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    if (!archivingAsset) return;
    setArchiving(true);
    try {
      await axios.patch(`/api/assets/${archivingAsset.id}/archive`, { archived: !showArchived }, { withCredentials: true });
      setArchiveDialogOpen(false);
      setArchivingAsset(null);
      fetchAssets(pagination.page);
      fetchSummary();
    } catch (err) {
      console.error('Failed to archive/unarchive asset:', err);
    } finally {
      setArchiving(false);
    }
  };

  // Delete handlers
  const handleOpenDelete = (asset: AssetRow) => {
    setDeletingAsset(asset);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingAsset) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/assets/${deletingAsset.id}`, { withCredentials: true });
      setDeleteDialogOpen(false);
      setDeletingAsset(null);
      fetchAssets(pagination.page);
      fetchSummary();
    } catch (err) {
      console.error('Failed to delete asset:', err);
    } finally {
      setDeleting(false);
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

  // ── Assign Forms handlers ──
  const fetchForms = useCallback(async () => {
    try {
      setFormsLoading(true);
      // Auto-seed pre-start forms (idempotent — skips if already seeded)
      await axios.post('/api/forms/seed-prestart', {}, { withCredentials: true }).catch(() => {});
      const res = await axios.get('/api/forms?includeSchema=false', { withCredentials: true });
      const allForms = res.data.data?.items || [];
      setFormsList(allForms.filter((f: { title: string }) => !f.title?.toLowerCase().includes('driver wellness')));
    } catch {
      setFormsList([]);
    } finally {
      setFormsLoading(false);
    }
  }, []);

  const handleOpenAssignForms = (asset: AssetRow) => {
    setAssignFormsAsset(asset);
    setSelectedFormIds(new Set(asset.formIds || []));
    setAssignFormsOpen(true);
    fetchForms();
    // Refresh from server in background
    axios.get(`/api/assets/${asset.id}`, { withCredentials: true })
      .then((res) => setSelectedFormIds(new Set(res.data.data?.formIds || [])))
      .catch(() => {});
  };

  const handleSaveForms = async () => {
    if (!assignFormsAsset) return;
    setSavingForms(true);
    try {
      await axios.put(
        `/api/assets/${assignFormsAsset.id}`,
        { formIds: Array.from(selectedFormIds) },
        { withCredentials: true },
      );
      setAssignFormsOpen(false);
      setAssignFormsAsset(null);
      fetchAssets(pagination.page);
    } catch (err) {
      console.error('Failed to assign forms:', err);
    } finally {
      setSavingForms(false);
    }
  };

  // ── Driver Access handlers ──
  const fetchDrivers = useCallback(async () => {
    try {
      setDriversLoading(true);
      const res = await axios.get('/api/drivers?limit=100', { withCredentials: true });
      setDriversList(res.data.data?.items || []);
    } catch {
      setDriversList([]);
    } finally {
      setDriversLoading(false);
    }
  }, []);

  const handleOpenDriverAccess = (asset: AssetRow) => {
    setDriverAccessAsset(asset);
    setSelectedDriverIds(new Set(asset.driverAccessIds || []));
    setDriverAccessOpen(true);
    fetchDrivers();
    // Refresh from server in background
    axios.get(`/api/assets/${asset.id}`, { withCredentials: true })
      .then((res) => setSelectedDriverIds(new Set(res.data.data?.driverAccessIds || [])))
      .catch(() => {});
  };

  const handleSaveDriverAccess = async () => {
    if (!driverAccessAsset) return;
    setSavingDrivers(true);
    try {
      await axios.put(
        `/api/assets/${driverAccessAsset.id}`,
        { driverAccessIds: Array.from(selectedDriverIds) },
        { withCredentials: true },
      );
      setDriverAccessOpen(false);
      setDriverAccessAsset(null);
      fetchAssets(pagination.page);
    } catch (err) {
      console.error('Failed to update driver access:', err);
    } finally {
      setSavingDrivers(false);
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

  const getComplianceBadge = (status?: string) => {
    switch (status) {
      case 'expired':
        return <Badge variant="destructive">Expired</Badge>;
      case 'expiring_soon':
        return <Badge variant="warning">Expiring</Badge>;
      case 'valid':
        return <Badge variant="success">Valid</Badge>;
      default:
        return <span className="text-muted-foreground">—</span>;
    }
  };

  // ── Column definitions ──
  const assetColumns: DataTableColumn<AssetRow>[] = [
    {
      key: 'name',
      header: 'Name',
      label: 'Name',
      pinned: true,
      sortable: true,
      render: (asset) => (
        <span className="font-medium text-foreground">{asset.name}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      label: 'Status',
      sortable: true,
      render: (asset) => getStatusBadge(asset.status),
    },
    {
      key: 'complianceStatus',
      header: 'Compliance',
      label: 'Compliance',
      sortable: true,
      render: (asset) => getComplianceBadge(asset.complianceStatus),
    },
    {
      key: 'assetTypeName',
      header: 'Asset Type',
      label: 'Asset Type',
      sortable: true,
      render: (asset) => (
        <span className="text-muted-foreground">{asset.assetTypeName || '—'}</span>
      ),
    },
    {
      key: 'makeModel',
      header: 'Make / Model',
      label: 'Make / Model',
      sortable: true,
      sortValue: (asset) => [asset.make, asset.model].filter(Boolean).join(' ') || null,
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
      sortable: true,
      render: (asset) => (
        <span className="text-muted-foreground">{asset.year || '—'}</span>
      ),
    },
    {
      key: 'licensePlate',
      header: 'License',
      label: 'License',
      sortable: true,
      render: (asset) => (
        <span className="text-muted-foreground">{asset.licensePlate || '—'}</span>
      ),
    },
    {
      key: 'currentOdometer',
      header: 'Odometer (km)',
      label: 'Odometer (km)',
      sortable: true,
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
      sortable: true,
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
      sortable: true,
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
      key: 'lastServiceDate',
      header: 'Last Service',
      label: 'Last Service Date',
      sortable: true,
      sortValue: (asset) => asset.lastServiceDate ? new Date(asset.lastServiceDate).getTime() : null,
      render: (asset) => (
        <span className="text-muted-foreground">
          {formatDate(asset.lastServiceDate)}
        </span>
      ),
    },
    {
      key: 'lastServiceMileage',
      header: 'Last Svc Odometer (km)',
      label: 'Last Service Odometer (km)',
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
      key: 'source',
      header: 'Source',
      label: 'Source',
      render: (asset) => <SourceBadge source={asset.source} />,
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
              className="cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {showArchived ? (
              <>
                {/* Command-sourced assets are archived/unarchived in Command
                    only — the import syncs the state here. */}
                {asset.source !== 'command' && (
                  <PermissionGuard permission={Permissions.assets.assets.form.archive}>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenArchive(asset);
                      }}
                    >
                      <ArchiveRestore className="h-4 w-4" />
                      Unarchive
                    </DropdownMenuItem>
                  </PermissionGuard>
                )}
                {asset.source !== 'command' && (
                  <PermissionGuard permission={Permissions.assets.assets.form.delete}>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDelete(asset);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </PermissionGuard>
                )}
                {asset.source === 'command' && (
                  <DropdownMenuItem disabled>
                    <Archive className="h-4 w-4" />
                    Managed in Command
                  </DropdownMenuItem>
                )}
              </>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/assets/${asset.id}`);
                  }}
                >
                  <Eye className="h-4 w-4" />
                  View
                </DropdownMenuItem>
                <PermissionGuard permission={Permissions.assets.assets.form.edit}>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/assets/${asset.id}/edit`);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                </PermissionGuard>
                <PermissionGuard permission={Permissions.assets.assets.form.inspect}>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setInspectAssetId(asset.id);
                    }}
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    Inspect
                  </DropdownMenuItem>
                </PermissionGuard>
                <PermissionGuard permission={Permissions.assets.assets.form.edit}>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenChangeTeam(asset);
                    }}
                  >
                    <Users className="h-4 w-4" />
                    Change Team
                  </DropdownMenuItem>
                </PermissionGuard>
                <PermissionGuard permission="inspections:forms:view">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenAssignForms(asset);
                    }}
                  >
                    <ClipboardList className="h-4 w-4" />
                    Assign Forms
                  </DropdownMenuItem>
                </PermissionGuard>
                <PermissionGuard permission={Permissions.assets.assets.form.edit}>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDriverAccess(asset);
                    }}
                  >
                    <KeyRound className="h-4 w-4" />
                    Driver Access
                  </DropdownMenuItem>
                </PermissionGuard>
                <PermissionGuard permission={Permissions.assets.assets.form.edit}>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleStatus(asset.id, asset.status);
                    }}
                  >
                    <Power className="h-4 w-4" />
                    {normalizeStatus(asset.status) === 'in_service'
                      ? 'Mark as Under Maintenance'
                      : 'Mark as Active'}
                  </DropdownMenuItem>
                </PermissionGuard>
                {/* Archive lives in Command for Command-sourced assets. */}
                {asset.source !== 'command' && (
                  <PermissionGuard permission={Permissions.assets.assets.form.archive}>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenArchive(asset);
                      }}
                    >
                      <Archive className="h-4 w-4" />
                      Archive
                    </DropdownMenuItem>
                  </PermissionGuard>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  // Hide the Source column when standalone (every row would just read "Local").
  const columns = connected ? assetColumns : assetColumns.filter((c) => c.key !== 'source');

  return (
    <div className="p-6">
      <InspectFormPickerDialog
        open={!!inspectAssetId}
        assetId={inspectAssetId ?? ''}
        onOpenChange={(o) => { if (!o) setInspectAssetId(null); }}
      />
      <VinLookupDialog
        open={vinDialogOpen}
        onOpenChange={setVinDialogOpen}
      />
      <GenerateBarcodeDialog
        open={barcodeDialogOpen}
        onOpenChange={setBarcodeDialogOpen}
        items={selectedAssets.map((a) => ({ id: a.id, name: a.name, code: a.assetNumber }))}
      />
      {/* Header */}
      <PageHeader
        title="Assets"
        count={hasActiveFilters ? filteredAssets.length : pagination.total}
        description="Manage your fleet vehicles and equipment"
        className="px-0 pt-0 pb-4"
      >
        {!connected && (
          <PermissionGuard permission={Permissions.assets.assets.form.create}>
            <Button onClick={() => setVinDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Asset
            </Button>
          </PermissionGuard>
        )}
      </PageHeader>

      {connected && (
        <div className="pb-3">
          <CommandManagedBanner />
        </div>
      )}

      {/* Summary ribbon */}
      <div className="px-6 pb-1">
        <div className="flex flex-wrap divide-x rounded-xl border bg-card shadow-sm">
          <StatSeg tone="primary" icon={Layers} label="Total assets" value={summary?.total} loading={!summary} />
          <StatSeg tone="emerald" icon={CheckCircle2} label="In service" value={summary?.inService} loading={!summary} />
          <StatSeg tone="amber" icon={Wrench} label="Under maintenance" value={summary?.outOfService} loading={!summary} />
          <StatSeg tone="red" icon={ShieldAlert} label="Non-compliant" value={summary?.nonCompliant} loading={!summary} />
        </div>
      </div>

      {/* Toolbar + Search */}
      <DataTableToolbar
        columns={columns}
        hiddenColumnKeys={hiddenColumnKeys}
        onHiddenColumnKeysChange={setHiddenColumnKeys}
        density={density}
        onDensityChange={setDensity}
        filterDefs={assetFilterDefs}
        filters={filters}
        onFilterChange={setFilter}
        onFiltersClear={clearFilters}
        afterControls={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={selectedKeys.size === 0}
              onClick={() => setBarcodeDialogOpen(true)}
            >
              <Barcode className="h-4 w-4" />
              Generate barcode
              {selectedKeys.size > 0 && (
                <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 text-xs rounded-full">
                  {selectedKeys.size}
                </Badge>
              )}
            </Button>
            <ShowArchivedToggle checked={showArchived} onCheckedChange={setShowArchived} />
          </div>
        }
        searchNode={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search assets..."
          />
        }
      />

      {/* Table */}
      <DataTable<AssetRow>
        columns={columns}
        data={filteredAssets}
        pagination={pagination}
        loading={loading}
        rowsPerPage={rowsPerPage}
        onPageChange={fetchAssets}
        onRowsPerPageChange={setRowsPerPage}
        onRowClick={showArchived ? undefined : (asset) => router.push(`/assets/${asset.id}`)}
        rowKey={(a) => a.id}
        density={density}
        hiddenColumnKeys={hiddenColumnKeys}
        selectable
        selectedKeys={selectedKeys}
        onSelectedKeysChange={setSelectedKeys}
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

      {/* Assign Forms Dialog */}
      <Dialog open={assignFormsOpen} onOpenChange={setAssignFormsOpen}>
        <DialogContent className="sm:max-w-110">
          <DialogHeader>
            <DialogTitle>Assign Forms</DialogTitle>
            <DialogDescription>
              Select forms to assign to &quot;{assignFormsAsset?.name}&quot;.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto rounded-lg border">
            {formsLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : formsList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No forms available
              </p>
            ) : (
              <div className="flex flex-col">
                {/* Select All */}
                {(() => {
                  const allSelected = formsList.length > 0 && formsList.every((f) => selectedFormIds.has(f.id));
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        if (allSelected) {
                          setSelectedFormIds(new Set());
                        } else {
                          setSelectedFormIds(new Set(formsList.map((f) => f.id)));
                        }
                      }}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 text-sm text-left border-b transition-colors',
                        allSelected ? 'bg-primary/5' : 'hover:bg-muted/50',
                      )}
                    >
                      <Checkbox checked={allSelected} tabIndex={-1} className="pointer-events-none" />
                      <span className="font-medium text-foreground">Select All</span>
                    </button>
                  );
                })()}
                {formsList.map((form) => {
                  const isSelected = selectedFormIds.has(form.id);
                  return (
                    <button
                      key={form.id}
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedFormIds);
                        if (isSelected) {
                          next.delete(form.id);
                        } else {
                          next.add(form.id);
                        }
                        setSelectedFormIds(next);
                      }}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 text-sm text-left border-b last:border-0 transition-colors',
                        isSelected ? 'bg-primary/5' : 'hover:bg-muted/50',
                      )}
                    >
                      <Checkbox checked={isSelected} tabIndex={-1} className="pointer-events-none" />
                      <span className="font-medium text-foreground">{form.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignFormsOpen(false)} disabled={savingForms}>
              Cancel
            </Button>
            <Button onClick={handleSaveForms} disabled={savingForms}>
              {savingForms ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={archivingAsset?.name}
        action={showArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingAsset?.name}
        onConfirm={handleDelete}
        loading={deleting}
      />

      {/* Driver Access Dialog */}
      <Dialog open={driverAccessOpen} onOpenChange={setDriverAccessOpen}>
        <DialogContent className="sm:max-w-110">
          <DialogHeader>
            <DialogTitle>Driver Access</DialogTitle>
            <DialogDescription>
              Select drivers who can access &quot;{driverAccessAsset?.name}&quot;.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto rounded-lg border">
            {driversLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : driversList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No drivers available
              </p>
            ) : (
              <div className="flex flex-col">
                {/* Select All */}
                {(() => {
                  const allSelected = driversList.length > 0 && driversList.every((d) => selectedDriverIds.has(d.id));
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        if (allSelected) {
                          setSelectedDriverIds(new Set());
                        } else {
                          setSelectedDriverIds(new Set(driversList.map((d) => d.id)));
                        }
                      }}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 text-sm text-left border-b transition-colors',
                        allSelected ? 'bg-primary/5' : 'hover:bg-muted/50',
                      )}
                    >
                      <Checkbox checked={allSelected} tabIndex={-1} className="pointer-events-none" />
                      <span className="font-medium text-foreground">Select All</span>
                    </button>
                  );
                })()}
                {driversList.map((driver) => {
                  const isSelected = selectedDriverIds.has(driver.id);
                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedDriverIds);
                        if (isSelected) {
                          next.delete(driver.id);
                        } else {
                          next.add(driver.id);
                        }
                        setSelectedDriverIds(next);
                      }}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 text-sm text-left border-b last:border-0 transition-colors',
                        isSelected ? 'bg-primary/5' : 'hover:bg-muted/50',
                      )}
                    >
                      <Checkbox checked={isSelected} tabIndex={-1} className="pointer-events-none" />
                      <span className="font-medium text-foreground">
                        {driver.firstName} {driver.lastName}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDriverAccessOpen(false)} disabled={savingDrivers}>
              Cancel
            </Button>
            <Button onClick={handleSaveDriverAccess} disabled={savingDrivers}>
              {savingDrivers ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
