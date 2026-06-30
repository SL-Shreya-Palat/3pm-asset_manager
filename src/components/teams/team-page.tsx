'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchInput } from '@/components/ui/search-input';
import { TablePagination } from '@/components/ui/table-pagination';
import { DataTable, type DataTableColumn, type DataTableFilterDef } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Spinner } from '@/components/ui/spinner';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable, applyTableFilters } from '@/hooks/use-data-table';
import { ASSET_STATUS_CONFIG, type AssetStatus } from '@/constants/assets';
import type { TeamRow, AssetRow, DriverRow, Pagination } from './types';

const TEAM_TABS = ['Users', 'Drivers', 'Assets', 'Inspections', 'Defects', 'Documents'] as const;
type TeamTab = (typeof TEAM_TABS)[number];

export function TeamPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 25,
    total: 0,
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TeamTab>('Users');
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Team create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingTeam, setEditingTeam] = useState<TeamRow | null>(null);
  const [teamName, setTeamName] = useState('');
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);

  // Team delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTeam, setDeletingTeam] = useState<TeamRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Assets tab state
  const [teamAssets, setTeamAssets] = useState<AssetRow[]>([]);
  const [teamAssetsPagination, setTeamAssetsPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [teamAssetsLoading, setTeamAssetsLoading] = useState(false);
  const [teamAssetsRowsPerPage, setTeamAssetsRowsPerPage] = useState(25);

  // Drivers tab state
  const [teamDrivers, setTeamDrivers] = useState<DriverRow[]>([]);
  const [teamDriversPagination, setTeamDriversPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [teamDriversLoading, setTeamDriversLoading] = useState(false);
  const [teamDriversRowsPerPage, setTeamDriversRowsPerPage] = useState(25);

  // Add Drivers dialog
  const [addDriversDialogOpen, setAddDriversDialogOpen] = useState(false);
  const [allDrivers, setAllDrivers] = useState<DriverRow[]>([]);
  const [allDriversPagination, setAllDriversPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [allDriversLoading, setAllDriversLoading] = useState(false);
  const [allDriversSearch, setAllDriversSearch, debouncedAllDriversSearch] = useDebouncedSearch(300);
  const [allDriversRowsPerPage, setAllDriversRowsPerPage] = useState(25);
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set());
  const [addingDrivers, setAddingDrivers] = useState(false);

  // Add Assets dialog
  const [addAssetsDialogOpen, setAddAssetsDialogOpen] = useState(false);
  const [allAssets, setAllAssets] = useState<AssetRow[]>([]);
  const [allAssetsPagination, setAllAssetsPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [allAssetsLoading, setAllAssetsLoading] = useState(false);
  const [allAssetsSearch, setAllAssetsSearch, debouncedAllAssetsSearch] = useDebouncedSearch(300);
  const [allAssetsRowsPerPage, setAllAssetsRowsPerPage] = useState(25);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [addingAssets, setAddingAssets] = useState(false);

  // Table features: teams table
  const teamsTable = useDataTable();
  // Table features: team assets table
  const teamAssetsTable = useDataTable();
  // Table features: team drivers table
  const teamDriversTable = useDataTable();

  const teamAssetFilterDefs: DataTableFilterDef[] = useMemo(() => [
    {
      columnKey: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { label: 'In Service', value: 'in_service' },
        { label: 'Out of Service', value: 'out_of_service' },
      ],
    },
  ], []);

  const filteredTeamAssets = useMemo(
    () => applyTableFilters(teamAssets, teamAssetsTable.filters, teamAssetFilterDefs),
    [teamAssets, teamAssetsTable.filters, teamAssetFilterDefs],
  );

  // ── Fetch teams ──
  const fetchTeams = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      const res = await axios.get(`/api/teams?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setTeams(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch teams:', err);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage]);

  useEffect(() => {
    fetchTeams(1);
  }, [fetchTeams]);

  // ── Fetch team assets ──
  const fetchTeamAssets = useCallback(async (page: number) => {
    if (!selectedTeamId) {
      setTeamAssets([]);
      return;
    }
    try {
      setTeamAssetsLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(teamAssetsRowsPerPage));
      params.set('teamId', selectedTeamId);
      const res = await axios.get(`/api/assets?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setTeamAssets(data.items || []);
      setTeamAssetsPagination(data.pagination || { page: 1, limit: teamAssetsRowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch team assets:', err);
      setTeamAssets([]);
    } finally {
      setTeamAssetsLoading(false);
    }
  }, [selectedTeamId, teamAssetsRowsPerPage]);

  useEffect(() => {
    if (activeTab === 'Assets' && selectedTeamId) {
      fetchTeamAssets(1);
    }
  }, [activeTab, selectedTeamId, fetchTeamAssets]);

  // ── Fetch team drivers ──
  const fetchTeamDrivers = useCallback(async (page: number) => {
    if (!selectedTeamId) {
      setTeamDrivers([]);
      return;
    }
    try {
      setTeamDriversLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(teamDriversRowsPerPage));
      params.set('teamId', selectedTeamId);
      const res = await axios.get(`/api/drivers?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setTeamDrivers(data.items || []);
      setTeamDriversPagination(data.pagination || { page: 1, limit: teamDriversRowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch team drivers:', err);
      setTeamDrivers([]);
    } finally {
      setTeamDriversLoading(false);
    }
  }, [selectedTeamId, teamDriversRowsPerPage]);

  useEffect(() => {
    if (activeTab === 'Drivers' && selectedTeamId) {
      fetchTeamDrivers(1);
    }
  }, [activeTab, selectedTeamId, fetchTeamDrivers]);

  // ── Fetch all drivers for add dialog ──
  const fetchAllDrivers = useCallback(async (page: number) => {
    try {
      setAllDriversLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(allDriversRowsPerPage));
      if (debouncedAllDriversSearch) params.set('search', debouncedAllDriversSearch);
      const res = await axios.get(`/api/drivers?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setAllDrivers(data.items || []);
      setAllDriversPagination(data.pagination || { page: 1, limit: allDriversRowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch drivers:', err);
      setAllDrivers([]);
    } finally {
      setAllDriversLoading(false);
    }
  }, [debouncedAllDriversSearch, allDriversRowsPerPage]);

  useEffect(() => {
    if (addDriversDialogOpen) {
      fetchAllDrivers(1);
    }
  }, [addDriversDialogOpen, fetchAllDrivers]);

  // ── Fetch all assets for add dialog ──
  const fetchAllAssets = useCallback(async (page: number) => {
    try {
      setAllAssetsLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(allAssetsRowsPerPage));
      if (debouncedAllAssetsSearch) params.set('search', debouncedAllAssetsSearch);
      const res = await axios.get(`/api/assets?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setAllAssets(data.items || []);
      setAllAssetsPagination(data.pagination || { page: 1, limit: allAssetsRowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch assets:', err);
      setAllAssets([]);
    } finally {
      setAllAssetsLoading(false);
    }
  }, [debouncedAllAssetsSearch, allAssetsRowsPerPage]);

  useEffect(() => {
    if (addAssetsDialogOpen) {
      fetchAllAssets(1);
    }
  }, [addAssetsDialogOpen, fetchAllAssets]);

  // ── Sidebar helpers ──
  const filteredTeams = teams.filter((team) =>
    team.name.toLowerCase().includes(sidebarSearch.toLowerCase()),
  );

  const selectedTeam = selectedTeamId ? teams.find((t) => t.id === selectedTeamId) : null;
  const headerTitle = selectedTeam ? selectedTeam.name : 'All Items';
  const headerCount = selectedTeam
    ? selectedTeam.assetCount + selectedTeam.driverCount
    : pagination.total;

  // ── Team CRUD handlers ──
  const handleOpenCreate = () => {
    setDialogMode('create');
    setEditingTeam(null);
    setTeamName('');
    setNameError('');
    setDialogOpen(true);
  };

  const handleOpenEdit = (team: TeamRow) => {
    setDialogMode('edit');
    setEditingTeam(team);
    setTeamName(team.name);
    setNameError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const trimmed = teamName.trim();
    if (!trimmed) { setNameError('Team name is required'); return; }
    if (trimmed.length > 100) { setNameError('Team name must be at most 100 characters'); return; }

    setSaving(true);
    setNameError('');
    try {
      if (dialogMode === 'create') {
        await axios.post('/api/teams', { name: trimmed }, { withCredentials: true });
      } else if (editingTeam) {
        await axios.put(`/api/teams/${editingTeam.id}`, { name: trimmed }, { withCredentials: true });
      }
      setDialogOpen(false);
      fetchTeams(pagination.page);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const error = err.response.data.error;
        if (typeof error === 'object' && error.name) setNameError(error.name);
        else if (typeof error === 'string') setNameError(error);
        else setNameError('Failed to save team');
      } else {
        setNameError('Failed to save team');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDelete = (team: TeamRow) => {
    setDeletingTeam(team);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingTeam) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/teams/${deletingTeam.id}`, { withCredentials: true });
      setDeleteDialogOpen(false);
      setDeletingTeam(null);
      if (selectedTeamId === deletingTeam.id) setSelectedTeamId(null);
      fetchTeams(pagination.page);
    } catch (err) {
      console.error('Failed to delete team:', err);
    } finally {
      setDeleting(false);
    }
  };

  // ── Asset assignment handlers ──
  const handleOpenAddAssets = () => {
    setSelectedAssetIds(new Set());
    setAllAssetsSearch('');
    setAddAssetsDialogOpen(true);
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const handleAddAssets = async () => {
    if (!selectedTeamId || selectedAssetIds.size === 0) return;
    setAddingAssets(true);
    try {
      await axios.post(
        `/api/teams/${selectedTeamId}/assets`,
        { assetIds: [...selectedAssetIds] },
        { withCredentials: true },
      );
      setAddAssetsDialogOpen(false);
      fetchTeamAssets(1);
      fetchTeams(pagination.page);
    } catch (err) {
      console.error('Failed to add assets:', err);
    } finally {
      setAddingAssets(false);
    }
  };

  const handleRemoveAssetFromTeam = async (assetId: string) => {
    if (!selectedTeamId) return;
    try {
      await axios.delete(`/api/teams/${selectedTeamId}/assets?assetId=${assetId}`, { withCredentials: true });
      fetchTeamAssets(teamAssetsPagination.page);
      fetchTeams(pagination.page);
    } catch (err) {
      console.error('Failed to remove asset:', err);
    }
  };

  // ── Driver assignment handlers ──
  const handleOpenAddDrivers = () => {
    setSelectedDriverIds(new Set());
    setAllDriversSearch('');
    setAddDriversDialogOpen(true);
  };

  const toggleDriverSelection = (driverId: string) => {
    setSelectedDriverIds((prev) => {
      const next = new Set(prev);
      if (next.has(driverId)) next.delete(driverId);
      else next.add(driverId);
      return next;
    });
  };

  const handleAddDrivers = async () => {
    if (!selectedTeamId || selectedDriverIds.size === 0) return;
    setAddingDrivers(true);
    try {
      await Promise.all(
        [...selectedDriverIds].map((driverId) =>
          axios.put(`/api/drivers/${driverId}`, { teamId: selectedTeamId }, { withCredentials: true }),
        ),
      );
      setAddDriversDialogOpen(false);
      fetchTeamDrivers(1);
      fetchTeams(pagination.page);
    } catch (err) {
      console.error('Failed to add drivers:', err);
    } finally {
      setAddingDrivers(false);
    }
  };

  const handleRemoveDriverFromTeam = async (driverId: string) => {
    if (!selectedTeamId) return;
    try {
      await axios.put(`/api/drivers/${driverId}`, { teamId: null }, { withCredentials: true });
      fetchTeamDrivers(teamDriversPagination.page);
      fetchTeams(pagination.page);
    } catch (err) {
      console.error('Failed to remove driver from team:', err);
    }
  };

  // ── Status badge helper ──
  const getStatusBadge = (status: string) => {
    const normalized = status === 'active' ? 'in_service' : status;
    const config = ASSET_STATUS_CONFIG[normalized as AssetStatus];
    if (!config) return <Badge variant="outline">{status}</Badge>;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const renderHeaderButton = () => {
    if (!selectedTeamId) {
      return (
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4" />
          Add Team
        </Button>
      );
    }
    if (activeTab === 'Assets') {
      return (
        <Button onClick={handleOpenAddAssets}>
          <Plus className="h-4 w-4" />
          Add Assets
        </Button>
      );
    }
    if (activeTab === 'Drivers') {
      return (
        <Button onClick={handleOpenAddDrivers}>
          <Plus className="h-4 w-4" />
          Add Drivers
        </Button>
      );
    }
    return null;
  };

  // ── Column definitions ──
  const teamColumns: DataTableColumn<TeamRow>[] = [
    {
      key: 'name',
      header: 'Team',
      label: 'Team Name',
      pinned: true,
      render: (team) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground">{team.name}</span>
        </div>
      ),
    },
    {
      key: 'assetCount',
      header: 'Assets',
      label: 'Asset Count',
      render: (team) => (
        <span className="text-muted-foreground">{team.assetCount}</span>
      ),
    },
    {
      key: 'driverCount',
      header: 'Drivers',
      label: 'Driver Count',
      render: (team) => (
        <span className="text-muted-foreground">{team.driverCount}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (team) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => handleOpenEdit(team)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => handleOpenDelete(team)} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const teamAssetColumns: DataTableColumn<AssetRow>[] = [
    {
      key: 'name',
      header: 'Name',
      label: 'Name',
      render: (asset) => (
        <span className="font-medium text-foreground">{asset.name}</span>
      ),
    },
    {
      key: 'assetNumber',
      header: 'Asset #',
      label: 'Asset Number',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.assetNumber || '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (asset) => getStatusBadge(asset.status),
    },
    {
      key: 'assetTypeName',
      header: 'Asset Type',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.assetTypeName || '—'}</span>
      ),
    },
    {
      key: 'makeModel',
      header: 'Make / Model',
      render: (asset) => (
        <span className="text-muted-foreground">
          {[asset.make, asset.model].filter(Boolean).join(' ') || '—'}
        </span>
      ),
    },
    {
      key: 'year',
      header: 'Year',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.year || '—'}</span>
      ),
    },
    {
      key: 'licensePlate',
      header: 'License',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.licensePlate || '—'}</span>
      ),
    },
    {
      key: 'currentOdometer',
      header: 'Mileage',
      render: (asset) => (
        <span className="text-muted-foreground">
          {asset.currentOdometer != null ? asset.currentOdometer.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'vin',
      header: 'VIN',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.vin || '—'}</span>
      ),
    },
    {
      key: 'color',
      header: 'Color',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.color || '—'}</span>
      ),
    },
    {
      key: 'tireSize',
      header: 'Tire Size',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.tireSize || '—'}</span>
      ),
    },
    {
      key: 'teamNames',
      header: 'Team',
      render: (asset) => (
        <span className="text-muted-foreground">
          {asset.teamNames.length > 0 ? asset.teamNames.join(', ') : '—'}
        </span>
      ),
    },
    {
      key: 'estimatedCost',
      header: 'Est. Cost',
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
      render: (asset) => (
        <span className="text-muted-foreground">
          {asset.currentEngineHours != null ? asset.currentEngineHours.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'assetSubtype',
      header: 'Subtype',
      render: (asset) => (
        <span className="text-muted-foreground">{asset.assetSubtype || '—'}</span>
      ),
    },
    {
      key: 'subscriptionType',
      header: 'Subscription',
      render: (asset) => (
        <span className="text-muted-foreground capitalize">{asset.subscriptionType || '—'}</span>
      ),
    },
    {
      key: 'lastServiceDate',
      header: 'Last Service',
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
      render: (asset) => (
        <span className="text-muted-foreground">
          {asset.lastServiceMileage != null ? asset.lastServiceMileage.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'lastServiceEngineHours',
      header: 'Last Svc Engine Hrs',
      render: (asset) => (
        <span className="text-muted-foreground">
          {asset.lastServiceEngineHours != null ? asset.lastServiceEngineHours.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
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
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleRemoveAssetFromTeam(asset.id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const teamDriverColumns: DataTableColumn<DriverRow>[] = [
    {
      key: 'name',
      header: 'Name',
      label: 'Name',
      render: (driver) => (
        <span className="font-medium text-foreground">
          {driver.firstName} {driver.lastName}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      label: 'Email',
      render: (driver) => (
        <span className="text-muted-foreground">{driver.email || '—'}</span>
      ),
    },
    {
      key: 'mobileNumber',
      header: 'Mobile',
      label: 'Mobile Number',
      render: (driver) => (
        <span className="text-muted-foreground">{driver.mobileNumber || '—'}</span>
      ),
    },
    {
      key: 'employeeNumber',
      header: 'Employee #',
      label: 'Employee Number',
      render: (driver) => (
        <span className="text-muted-foreground">{driver.employeeNumber || '—'}</span>
      ),
    },
    {
      key: 'licenseNumber',
      header: 'License #',
      label: 'License Number',
      render: (driver) => (
        <span className="text-muted-foreground">{driver.licenseNumber || '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (driver) => (
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleRemoveDriverFromTeam(driver.id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-full">
      {/* Left Sidebar */}
      <div className="w-[280px] border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground mb-3">Teams</h2>
          <SearchInput
            value={sidebarSearch}
            onChange={setSidebarSearch}
            placeholder="Search teams..."
          />
        </div>
        <div className="flex-1 overflow-auto p-2">
          <button
            onClick={() => setSelectedTeamId(null)}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors text-left w-full',
              selectedTeamId === null
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-muted',
            )}
          >
            <List className="h-4 w-4 shrink-0" />
            <span className="truncate">All Teams</span>
          </button>
          {loading ? (
            <div className="flex justify-center py-6"><Spinner size="sm" /></div>
          ) : filteredTeams.length === 0 && sidebarSearch ? (
            <p className="text-sm text-muted-foreground text-center py-4">No teams match your search</p>
          ) : (
            <div className="flex flex-col gap-1 mt-1">
              {filteredTeams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeamId(team.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors text-left w-full',
                    selectedTeamId === team.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted',
                  )}
                >
                  <Users className="h-4 w-4 shrink-0" />
                  <span className="truncate">{team.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Side */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h1 className="text-2xl font-semibold text-foreground">
            {headerTitle}
            <span className="text-muted-foreground font-normal ml-2">({headerCount})</span>
          </h1>
          {renderHeaderButton()}
        </div>

        {/* Tabs - only shown when a specific team is selected */}
        {selectedTeamId && (
          <div className="border-b border-border px-6">
            <div className="flex gap-0">
              {TEAM_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                    activeTab === tab
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto p-6">
          {/* All Teams view - no tabs, just the teams table */}
          {!selectedTeamId && (
            <>
              <DataTableToolbar
                columns={teamColumns}
                hiddenColumnKeys={teamsTable.hiddenColumnKeys}
                onHiddenColumnKeysChange={teamsTable.setHiddenColumnKeys}
                density={teamsTable.density}
                onDensityChange={teamsTable.setDensity}
              />
              <DataTable<TeamRow>
                columns={teamColumns}
                data={teams}
                pagination={pagination}
                loading={loading}
                rowsPerPage={rowsPerPage}
                onPageChange={fetchTeams}
                onRowsPerPageChange={setRowsPerPage}
                rowKey={(t) => t.id}
                density={teamsTable.density}
                hiddenColumnKeys={teamsTable.hiddenColumnKeys}
                emptyMessage='No teams yet. Click "Add Team" to create one.'
              />
            </>
          )}

          {/* Users tab (specific team selected) */}
          {selectedTeamId && activeTab === 'Users' && (
            <div className="flex items-center justify-center h-40 rounded-lg border bg-card text-muted-foreground">
              Users coming soon
            </div>
          )}

          {/* Assets tab */}
          {selectedTeamId && activeTab === 'Assets' && (
            <>
              <DataTableToolbar
                columns={teamAssetColumns}
                hiddenColumnKeys={teamAssetsTable.hiddenColumnKeys}
                onHiddenColumnKeysChange={teamAssetsTable.setHiddenColumnKeys}
                density={teamAssetsTable.density}
                onDensityChange={teamAssetsTable.setDensity}
                filterDefs={teamAssetFilterDefs}
                filters={teamAssetsTable.filters}
                onFilterChange={teamAssetsTable.setFilter}
                onFiltersClear={teamAssetsTable.clearFilters}
              />
              <DataTable<AssetRow>
                columns={teamAssetColumns}
                data={filteredTeamAssets}
                pagination={teamAssetsPagination}
                loading={teamAssetsLoading}
                rowsPerPage={teamAssetsRowsPerPage}
                onPageChange={fetchTeamAssets}
                onRowsPerPageChange={setTeamAssetsRowsPerPage}
                rowKey={(a) => a.id}
                density={teamAssetsTable.density}
                hiddenColumnKeys={teamAssetsTable.hiddenColumnKeys}
                emptyMessage='No assets assigned. Click "Add Assets" to assign assets to this team.'
              />
            </>
          )}

          {/* Drivers tab */}
          {selectedTeamId && activeTab === 'Drivers' && (
            <>
              <DataTableToolbar
                columns={teamDriverColumns}
                hiddenColumnKeys={teamDriversTable.hiddenColumnKeys}
                onHiddenColumnKeysChange={teamDriversTable.setHiddenColumnKeys}
                density={teamDriversTable.density}
                onDensityChange={teamDriversTable.setDensity}
              />
              <DataTable<DriverRow>
                columns={teamDriverColumns}
                data={teamDrivers}
                pagination={teamDriversPagination}
                loading={teamDriversLoading}
                rowsPerPage={teamDriversRowsPerPage}
                onPageChange={fetchTeamDrivers}
                onRowsPerPageChange={setTeamDriversRowsPerPage}
                rowKey={(d) => d.id}
                density={teamDriversTable.density}
                hiddenColumnKeys={teamDriversTable.hiddenColumnKeys}
                emptyMessage='No drivers assigned. Click "Add Drivers" to assign drivers to this team.'
              />
            </>
          )}

          {/* Other tabs */}
          {selectedTeamId && activeTab !== 'Users' && activeTab !== 'Assets' && activeTab !== 'Drivers' && (
            <div className="flex items-center justify-center h-40 rounded-lg border bg-card text-muted-foreground">
              {activeTab} coming soon
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Team Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create' ? 'Create Team' : 'Edit Team'}</DialogTitle>
            <DialogDescription>
              {dialogMode === 'create'
                ? 'Add a new team to organize your assets and drivers.'
                : 'Update the team name.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-foreground" htmlFor="team-name">Team Name</label>
            <Input
              id="team-name"
              placeholder="Enter team name"
              value={teamName}
              onChange={(e) => { setTeamName(e.target.value); setNameError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              className="mt-1.5"
            />
            {nameError && <p className="text-sm text-destructive mt-1">{nameError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : dialogMode === 'create' ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Team Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Team</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingTeam?.name}&quot;? This action cannot be undone.
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

      {/* Add Assets Dialog */}
      <Dialog open={addAssetsDialogOpen} onOpenChange={setAddAssetsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Assets</DialogTitle>
            <DialogDescription>Select the assets to add to the team.</DialogDescription>
          </DialogHeader>

          <SearchInput
            value={allAssetsSearch}
            onChange={setAllAssetsSearch}
            placeholder="Search assets..."
          />

          <div className="rounded-lg border overflow-hidden mt-2 max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="border-b bg-muted/50">
                  <th className="w-10 px-4 py-3" />
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Asset Name</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Teams</th>
                </tr>
              </thead>
              <tbody>
                {allAssetsLoading ? (
                  <TableSkeleton columns={4} rows={5} />
                ) : allAssets.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No assets found</td></tr>
                ) : (
                  allAssets.map((asset) => {
                    const isAlreadyInTeam = selectedTeamId ? asset.teamIds.includes(selectedTeamId) : false;
                    const isSelected = selectedAssetIds.has(asset.id);
                    return (
                      <tr
                        key={asset.id}
                        className={cn(
                          'border-b last:border-0 transition-colors cursor-pointer',
                          isSelected ? 'bg-primary/5' : 'hover:bg-muted/30',
                          isAlreadyInTeam && 'opacity-50',
                        )}
                        onClick={() => { if (!isAlreadyInTeam) toggleAssetSelection(asset.id); }}
                      >
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={isSelected || isAlreadyInTeam}
                            disabled={isAlreadyInTeam}
                            onCheckedChange={() => { if (!isAlreadyInTeam) toggleAssetSelection(asset.id); }}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{asset.name}</td>
                        <td className="px-4 py-3">{getStatusBadge(asset.status)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {asset.teamNames.length > 0 ? asset.teamNames.join(', ') : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            page={allAssetsPagination.page}
            limit={allAssetsRowsPerPage}
            total={allAssetsPagination.total}
            onPageChange={fetchAllAssets}
            onRowsPerPageChange={setAllAssetsRowsPerPage}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAssetsDialogOpen(false)} disabled={addingAssets}>
              Cancel
            </Button>
            <Button onClick={handleAddAssets} disabled={addingAssets || selectedAssetIds.size === 0}>
              {addingAssets ? 'Adding...' : `Add Assets (${selectedAssetIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Drivers Dialog */}
      <Dialog open={addDriversDialogOpen} onOpenChange={setAddDriversDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Drivers</DialogTitle>
            <DialogDescription>Select the drivers to add to the team.</DialogDescription>
          </DialogHeader>

          <SearchInput
            value={allDriversSearch}
            onChange={setAllDriversSearch}
            placeholder="Search drivers..."
          />

          <div className="rounded-lg border overflow-hidden mt-2 max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="border-b bg-muted/50">
                  <th className="w-10 px-4 py-3" />
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Name</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Email</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Employee #</th>
                </tr>
              </thead>
              <tbody>
                {allDriversLoading ? (
                  <TableSkeleton columns={4} rows={5} />
                ) : allDrivers.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No drivers found</td></tr>
                ) : (
                  allDrivers.map((driver) => {
                    const isAlreadyInTeam = selectedTeamId ? driver.teamId === selectedTeamId : false;
                    const isSelected = selectedDriverIds.has(driver.id);
                    return (
                      <tr
                        key={driver.id}
                        className={cn(
                          'border-b last:border-0 transition-colors cursor-pointer',
                          isSelected ? 'bg-primary/5' : 'hover:bg-muted/30',
                          isAlreadyInTeam && 'opacity-50',
                        )}
                        onClick={() => { if (!isAlreadyInTeam) toggleDriverSelection(driver.id); }}
                      >
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={isSelected || isAlreadyInTeam}
                            disabled={isAlreadyInTeam}
                            onCheckedChange={() => { if (!isAlreadyInTeam) toggleDriverSelection(driver.id); }}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {driver.firstName} {driver.lastName}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{driver.email || '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{driver.employeeNumber || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            page={allDriversPagination.page}
            limit={allDriversRowsPerPage}
            total={allDriversPagination.total}
            onPageChange={fetchAllDrivers}
            onRowsPerPageChange={setAllDriversRowsPerPage}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDriversDialogOpen(false)} disabled={addingDrivers}>
              Cancel
            </Button>
            <Button onClick={handleAddDrivers} disabled={addingDrivers || selectedDriverIds.size === 0}>
              {addingDrivers ? 'Adding...' : `Add Drivers (${selectedDriverIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
