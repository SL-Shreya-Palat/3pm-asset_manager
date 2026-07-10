'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Plus,
  Edit,
  Trash2,
  Users,
  List,
  Info,
  Archive,
  ArchiveRestore,
} from 'lucide-react';
import { Button, LoadingButton } from '@/components/ui/button';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';
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
import { PageHeader } from '@/components/ui/page-header';
import { ShowArchivedToggle } from '@/components/ui/show-archived-toggle';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { cn, formatDate } from '@/lib/utils';
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
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { checkRecordOwnership } from '@/lib/rbac';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Permissions } from '@/consts/permissions';
import { showSuccessToast, showErrorToast } from '@/lib/toastUtils';
import type { TeamRow, AssetRow, DriverRow, UserRow, DefectRow, InspectionRow, Pagination } from './types';

const TEAM_TABS = ['Users', 'Drivers', 'Assets', 'Inspections', 'Defects', 'Documents'] as const;
type TeamTab = (typeof TEAM_TABS)[number];

const TEAM_FORM_ID = 'people.teams.team';

export function TeamPage() {
  const { user } = useAuth();
  const { hasFullAccess, permissionIndex } = useRoleAccess();

  // Permission levels for row-level "OWN" checks
  const editLevel = hasFullAccess ? 'ALL' : permissionIndex.getEditLevel(TEAM_FORM_ID);
  const archiveLevel = hasFullAccess ? 'ALL' : permissionIndex.getArchiveLevel(TEAM_FORM_ID);
  const deleteLevel = hasFullAccess ? 'ALL' : permissionIndex.getDeleteLevel(TEAM_FORM_ID);

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

  // Tab content search (shared across all tabs, resets on tab change)
  const [tabSearch, setTabSearch, debouncedTabSearch] = useDebouncedSearch(300);

  // Team create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingTeam, setEditingTeam] = useState<TeamRow | null>(null);
  const [teamName, setTeamName] = useState('');
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);

  // Archive state
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingTeam, setArchivingTeam] = useState<TeamRow | null>(null);
  const [archiving, setArchiving] = useState(false);

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

  // Users tab state
  const [teamUsers, setTeamUsers] = useState<UserRow[]>([]);
  const [teamUsersPagination, setTeamUsersPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [teamUsersLoading, setTeamUsersLoading] = useState(false);
  const [teamUsersRowsPerPage, setTeamUsersRowsPerPage] = useState(25);

  // Add Users dialog
  const [addUsersDialogOpen, setAddUsersDialogOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [allUsersPagination, setAllUsersPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [allUsersLoading, setAllUsersLoading] = useState(false);
  const [allUsersSearch, setAllUsersSearch, debouncedAllUsersSearch] = useDebouncedSearch(300);
  const [allUsersRowsPerPage, setAllUsersRowsPerPage] = useState(25);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [addingUsers, setAddingUsers] = useState(false);

  // Defects tab state
  const [teamDefects, setTeamDefects] = useState<DefectRow[]>([]);
  const [teamDefectsPagination, setTeamDefectsPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [teamDefectsLoading, setTeamDefectsLoading] = useState(false);
  const [teamDefectsRowsPerPage, setTeamDefectsRowsPerPage] = useState(25);

  // Add Defects dialog
  const [addDefectsDialogOpen, setAddDefectsDialogOpen] = useState(false);
  const [allDefects, setAllDefects] = useState<DefectRow[]>([]);
  const [allDefectsPagination, setAllDefectsPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [allDefectsLoading, setAllDefectsLoading] = useState(false);
  const [allDefectsSearch, setAllDefectsSearch, debouncedAllDefectsSearch] = useDebouncedSearch(300);
  const [allDefectsRowsPerPage, setAllDefectsRowsPerPage] = useState(25);
  const [selectedDefectIds, setSelectedDefectIds] = useState<Set<string>>(new Set());
  const [addingDefects, setAddingDefects] = useState(false);

  // Inspections tab state
  const [teamInspections, setTeamInspections] = useState<InspectionRow[]>([]);
  const [teamInspectionsPagination, setTeamInspectionsPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [teamInspectionsLoading, setTeamInspectionsLoading] = useState(false);
  const [teamInspectionsRowsPerPage, setTeamInspectionsRowsPerPage] = useState(25);

  // Add Inspections dialog
  const [addInspectionsDialogOpen, setAddInspectionsDialogOpen] = useState(false);
  const [allInspections, setAllInspections] = useState<InspectionRow[]>([]);
  const [allInspectionsPagination, setAllInspectionsPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [allInspectionsLoading, setAllInspectionsLoading] = useState(false);
  const [allInspectionsSearch, setAllInspectionsSearch, debouncedAllInspectionsSearch] = useDebouncedSearch(300);
  const [allInspectionsRowsPerPage, setAllInspectionsRowsPerPage] = useState(25);
  const [selectedInspectionIds, setSelectedInspectionIds] = useState<Set<string>>(new Set());
  const [addingInspections, setAddingInspections] = useState(false);

  // Table features: teams table
  const teamsTable = useDataTable();
  // Table features: team assets table
  const teamAssetsTable = useDataTable();
  // Table features: team drivers table
  const teamDriversTable = useDataTable();
  // Table features: team users table
  const teamUsersTable = useDataTable();
  // Table features: team defects table
  const teamDefectsTable = useDataTable();
  // Table features: team inspections table
  const teamInspectionsTable = useDataTable();

  const teamAssetFilterDefs: DataTableFilterDef[] = useMemo(() => [
    {
      columnKey: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { label: 'Active', value: 'in_service' },
        { label: 'Under Maintenance', value: 'out_of_service' },
      ],
    },
  ], []);

  const filteredTeamAssets = useMemo(
    () => applyTableFilters(teamAssets, teamAssetsTable.filters, teamAssetFilterDefs),
    [teamAssets, teamAssetsTable.filters, teamAssetFilterDefs],
  );

  const teamDefectFilterDefs: DataTableFilterDef[] = useMemo(() => [
    {
      columnKey: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { label: 'New', value: 'new' },
        { label: 'In Progress', value: 'in_progress' },
        { label: 'Corrected', value: 'corrected' },
        { label: 'No Correction Needed', value: 'no_correction_needed' },
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
  ], []);

  const filteredTeamDefects = useMemo(
    () => applyTableFilters(teamDefects, teamDefectsTable.filters, teamDefectFilterDefs),
    [teamDefects, teamDefectsTable.filters, teamDefectFilterDefs],
  );

  // ── Fetch teams ──
  const fetchTeams = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (showArchived) params.set('showArchived', 'true');
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
  }, [rowsPerPage, showArchived]);

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
      if (debouncedTabSearch) params.set('search', debouncedTabSearch);
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
  }, [selectedTeamId, teamAssetsRowsPerPage, debouncedTabSearch]);

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
      if (debouncedTabSearch) params.set('search', debouncedTabSearch);
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
  }, [selectedTeamId, teamDriversRowsPerPage, debouncedTabSearch]);

  useEffect(() => {
    if (activeTab === 'Drivers' && selectedTeamId) {
      fetchTeamDrivers(1);
    }
  }, [activeTab, selectedTeamId, fetchTeamDrivers]);

  // ── Fetch team users ──
  const fetchTeamUsers = useCallback(async (page: number) => {
    if (!selectedTeamId) {
      setTeamUsers([]);
      return;
    }
    try {
      setTeamUsersLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(teamUsersRowsPerPage));
      params.set('teamId', selectedTeamId);
      if (debouncedTabSearch) params.set('search', debouncedTabSearch);
      const res = await axios.get(`/api/users?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setTeamUsers(data.items || []);
      setTeamUsersPagination(data.pagination || { page: 1, limit: teamUsersRowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch team users:', err);
      setTeamUsers([]);
    } finally {
      setTeamUsersLoading(false);
    }
  }, [selectedTeamId, teamUsersRowsPerPage, debouncedTabSearch]);

  useEffect(() => {
    if (activeTab === 'Users' && selectedTeamId) {
      fetchTeamUsers(1);
    }
  }, [activeTab, selectedTeamId, fetchTeamUsers]);

  // ── Fetch team defects ──
  const fetchTeamDefects = useCallback(async (page: number) => {
    if (!selectedTeamId) {
      setTeamDefects([]);
      return;
    }
    try {
      setTeamDefectsLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(teamDefectsRowsPerPage));
      params.set('teamId', selectedTeamId);
      if (debouncedTabSearch) params.set('search', debouncedTabSearch);
      const res = await axios.get(`/api/defects?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setTeamDefects(data.items || []);
      setTeamDefectsPagination(data.pagination || { page: 1, limit: teamDefectsRowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch team defects:', err);
      setTeamDefects([]);
    } finally {
      setTeamDefectsLoading(false);
    }
  }, [selectedTeamId, teamDefectsRowsPerPage, debouncedTabSearch]);

  useEffect(() => {
    if (activeTab === 'Defects' && selectedTeamId) {
      fetchTeamDefects(1);
    }
  }, [activeTab, selectedTeamId, fetchTeamDefects]);

  // ── Fetch team inspections ──
  const fetchTeamInspections = useCallback(async (page: number) => {
    if (!selectedTeamId) {
      setTeamInspections([]);
      return;
    }
    try {
      setTeamInspectionsLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(teamInspectionsRowsPerPage));
      params.set('teamId', selectedTeamId);
      if (debouncedTabSearch) params.set('search', debouncedTabSearch);
      const res = await axios.get(`/api/inspection-submissions?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setTeamInspections(data.items || []);
      setTeamInspectionsPagination(data.pagination || { page: 1, limit: teamInspectionsRowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch team inspections:', err);
      setTeamInspections([]);
    } finally {
      setTeamInspectionsLoading(false);
    }
  }, [selectedTeamId, teamInspectionsRowsPerPage, debouncedTabSearch]);

  useEffect(() => {
    if (activeTab === 'Inspections' && selectedTeamId) {
      fetchTeamInspections(1);
    }
  }, [activeTab, selectedTeamId, fetchTeamInspections]);

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

  // ── Fetch all users for add dialog ──
  const fetchAllUsers = useCallback(async (page: number) => {
    try {
      setAllUsersLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(allUsersRowsPerPage));
      if (debouncedAllUsersSearch) params.set('search', debouncedAllUsersSearch);
      const res = await axios.get(`/api/users?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setAllUsers(data.items || []);
      setAllUsersPagination(data.pagination || { page: 1, limit: allUsersRowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setAllUsers([]);
    } finally {
      setAllUsersLoading(false);
    }
  }, [debouncedAllUsersSearch, allUsersRowsPerPage]);

  useEffect(() => {
    if (addUsersDialogOpen) {
      fetchAllUsers(1);
    }
  }, [addUsersDialogOpen, fetchAllUsers]);

  // ── Fetch all defects for add dialog ──
  const fetchAllDefects = useCallback(async (page: number) => {
    try {
      setAllDefectsLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(allDefectsRowsPerPage));
      if (debouncedAllDefectsSearch) params.set('search', debouncedAllDefectsSearch);
      const res = await axios.get(`/api/defects?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setAllDefects(data.items || []);
      setAllDefectsPagination(data.pagination || { page: 1, limit: allDefectsRowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch defects:', err);
      setAllDefects([]);
    } finally {
      setAllDefectsLoading(false);
    }
  }, [debouncedAllDefectsSearch, allDefectsRowsPerPage]);

  useEffect(() => {
    if (addDefectsDialogOpen) {
      fetchAllDefects(1);
    }
  }, [addDefectsDialogOpen, fetchAllDefects]);

  // ── Fetch all inspections for add dialog ──
  const fetchAllInspections = useCallback(async (page: number) => {
    try {
      setAllInspectionsLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(allInspectionsRowsPerPage));
      if (debouncedAllInspectionsSearch) params.set('search', debouncedAllInspectionsSearch);
      const res = await axios.get(`/api/inspection-submissions?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setAllInspections(data.items || []);
      setAllInspectionsPagination(data.pagination || { page: 1, limit: allInspectionsRowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch inspections:', err);
      setAllInspections([]);
    } finally {
      setAllInspectionsLoading(false);
    }
  }, [debouncedAllInspectionsSearch, allInspectionsRowsPerPage]);

  useEffect(() => {
    if (addInspectionsDialogOpen) {
      fetchAllInspections(1);
    }
  }, [addInspectionsDialogOpen, fetchAllInspections]);

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
      showSuccessToast(dialogMode === 'create' ? 'Team created successfully' : 'Team updated successfully');
      setDialogOpen(false);
      fetchTeams(pagination.page);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const error = err.response.data.error;
        if (typeof error === 'object' && error.name) {
          setNameError(error.name);
          showErrorToast(error.name);
        } else if (typeof error === 'string') {
          setNameError(error);
          showErrorToast(error);
        } else {
          setNameError('Failed to save team');
          showErrorToast('Failed to save team');
        }
      } else {
        setNameError('Failed to save team');
        showErrorToast('Failed to save team');
      }
    } finally {
      setSaving(false);
    }
  };

  // Archive handlers
  const handleOpenArchive = (team: TeamRow) => {
    setArchivingTeam(team);
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    if (!archivingTeam) return;
    setArchiving(true);
    try {
      const archived = !showArchived; // If viewing active items, we archive. If viewing archived, we unarchive.
      await axios.patch(`/api/teams/${archivingTeam.id}/archive`, { archived }, { withCredentials: true });
      setArchiveDialogOpen(false);
      setArchivingTeam(null);
      fetchTeams(pagination.page);
    } catch (err) {
      console.error('Failed to archive/unarchive team:', err);
    } finally {
      setArchiving(false);
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

  // ── User assignment handlers ──
  const handleOpenAddUsers = () => {
    setSelectedUserIds(new Set());
    setAllUsersSearch('');
    setAddUsersDialogOpen(true);
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleAddUsers = async () => {
    if (!selectedTeamId || selectedUserIds.size === 0) return;
    setAddingUsers(true);
    try {
      await axios.post(
        `/api/teams/${selectedTeamId}/users`,
        { memberIds: [...selectedUserIds] },
        { withCredentials: true },
      );
      setAddUsersDialogOpen(false);
      fetchTeamUsers(1);
      fetchTeams(pagination.page);
    } catch (err) {
      console.error('Failed to add users:', err);
    } finally {
      setAddingUsers(false);
    }
  };

  const handleRemoveUserFromTeam = async (memberId: string) => {
    if (!selectedTeamId) return;
    try {
      await axios.delete(`/api/teams/${selectedTeamId}/users?memberId=${memberId}`, { withCredentials: true });
      fetchTeamUsers(teamUsersPagination.page);
      fetchTeams(pagination.page);
    } catch (err) {
      console.error('Failed to remove user:', err);
    }
  };

  const handleUpdateUserTeamRole = async (memberId: string, role: 'managing' | 'following') => {
    if (!selectedTeamId) return;
    try {
      await axios.patch(
        `/api/teams/${selectedTeamId}/users`,
        { memberId, role },
        { withCredentials: true },
      );
      fetchTeamUsers(teamUsersPagination.page);
    } catch (err) {
      console.error('Failed to update user role:', err);
    }
  };

  // ── Defect assignment handlers ──
  const handleOpenAddDefects = () => {
    setSelectedDefectIds(new Set());
    setAllDefectsSearch('');
    setAddDefectsDialogOpen(true);
  };

  const toggleDefectSelection = (defectId: string) => {
    setSelectedDefectIds((prev) => {
      const next = new Set(prev);
      if (next.has(defectId)) next.delete(defectId);
      else next.add(defectId);
      return next;
    });
  };

  const handleAddDefects = async () => {
    if (!selectedTeamId || selectedDefectIds.size === 0) return;
    setAddingDefects(true);
    try {
      await axios.post(
        `/api/teams/${selectedTeamId}/defects`,
        { defectIds: [...selectedDefectIds] },
        { withCredentials: true },
      );
      setAddDefectsDialogOpen(false);
      fetchTeamDefects(1);
      fetchTeams(pagination.page);
    } catch (err) {
      console.error('Failed to add defects:', err);
    } finally {
      setAddingDefects(false);
    }
  };

  const handleRemoveDefectFromTeam = async (defectId: string) => {
    if (!selectedTeamId) return;
    try {
      await axios.delete(`/api/teams/${selectedTeamId}/defects?defectId=${defectId}`, { withCredentials: true });
      fetchTeamDefects(teamDefectsPagination.page);
      fetchTeams(pagination.page);
    } catch (err) {
      console.error('Failed to remove defect:', err);
    }
  };

  // ── Inspection assignment handlers ──
  const handleOpenAddInspections = () => {
    setSelectedInspectionIds(new Set());
    setAllInspectionsSearch('');
    setAddInspectionsDialogOpen(true);
  };

  const toggleInspectionSelection = (inspectionId: string) => {
    setSelectedInspectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(inspectionId)) next.delete(inspectionId);
      else next.add(inspectionId);
      return next;
    });
  };

  const handleAddInspections = async () => {
    if (!selectedTeamId || selectedInspectionIds.size === 0) return;
    setAddingInspections(true);
    try {
      await axios.post(
        `/api/teams/${selectedTeamId}/inspections`,
        { inspectionIds: [...selectedInspectionIds] },
        { withCredentials: true },
      );
      setAddInspectionsDialogOpen(false);
      fetchTeamInspections(1);
      fetchTeams(pagination.page);
    } catch (err) {
      console.error('Failed to add inspections:', err);
    } finally {
      setAddingInspections(false);
    }
  };

  const handleRemoveInspectionFromTeam = async (inspectionId: string) => {
    if (!selectedTeamId) return;
    try {
      await axios.delete(`/api/teams/${selectedTeamId}/inspections?inspectionId=${inspectionId}`, { withCredentials: true });
      fetchTeamInspections(teamInspectionsPagination.page);
      fetchTeams(pagination.page);
    } catch (err) {
      console.error('Failed to remove inspection:', err);
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
        <PermissionGuard permission={Permissions.people.teams.form.create}>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Add Team
          </Button>
        </PermissionGuard>
      );
    }
    if (activeTab === 'Users') {
      return (
        <Button onClick={handleOpenAddUsers}>
          <Plus className="h-4 w-4" />
          Add Users
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
    if (activeTab === 'Defects') {
      return (
        <Button onClick={handleOpenAddDefects}>
          <Plus className="h-4 w-4" />
          Add Defects
        </Button>
      );
    }
    if (activeTab === 'Inspections') {
      return (
        <Button onClick={handleOpenAddInspections}>
          <Plus className="h-4 w-4" />
          Add Inspections
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
        <RowActions>
          {!showArchived && (
            <>
              {checkRecordOwnership(editLevel, team.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.people.teams.form.edit}>
                  <RowActionButton label="Edit" icon={<Edit />} onClick={() => handleOpenEdit(team)} />
                </PermissionGuard>
              )}
              {checkRecordOwnership(archiveLevel, team.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.people.teams.form.archive}>
                  <RowActionButton label="Archive" icon={<Archive />} onClick={() => handleOpenArchive(team)} />
                </PermissionGuard>
              )}
            </>
          )}
          {showArchived && (
            <>
              {checkRecordOwnership(archiveLevel, team.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.people.teams.form.archive}>
                  <RowActionButton label="Unarchive" icon={<ArchiveRestore />} onClick={() => handleOpenArchive(team)} />
                </PermissionGuard>
              )}
              {checkRecordOwnership(deleteLevel, team.createdBy, user?.id) && (
                <PermissionGuard permission={Permissions.people.teams.form.delete}>
                  <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(team)} />
                </PermissionGuard>
              )}
            </>
          )}
        </RowActions>
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
      header: 'Odometer (km)',
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
          {formatDate(asset.lastServiceDate)}
        </span>
      ),
    },
    {
      key: 'lastServiceMileage',
      header: 'Last Svc Odometer (km)',
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

  const teamUserColumns: DataTableColumn<UserRow>[] = [
    {
      key: 'name',
      header: 'User name',
      label: 'User Name',
      render: (user) => (
        <span className="font-medium text-foreground">
          {user.firstName} {user.lastName}
        </span>
      ),
    },
    {
      key: 'roleName',
      header: 'Role',
      label: 'Role',
      render: (user) => (
        <span className="text-muted-foreground">{user.roleName || '—'}</span>
      ),
    },
    {
      key: 'teamRole',
      header: (
        <span className="inline-flex items-center gap-1">
          Following
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-left">
                <p className="mb-1.5">
                  <strong>Managing:</strong> Ability to edit Drivers, Assets and Managers within the Team. See and receive realtime alerts and notifications for Faults/Inspections of its Drivers and Assets.
                </p>
                <p>
                  <strong>Following:</strong> See and receive realtime alerts and notifications for Faults/Inspections of the Drivers and Assets within the Team.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </span>
      ),
      label: 'Following',
      render: (user) => {
        const role = user.teamRole || 'following';
        return (
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              className={cn(
                'px-3 py-1 text-xs font-medium transition-colors',
                role === 'managing'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted',
              )}
              onClick={(e) => { e.stopPropagation(); handleUpdateUserTeamRole(user.id, 'managing'); }}
            >
              Managing
            </button>
            <button
              type="button"
              className={cn(
                'px-3 py-1 text-xs font-medium transition-colors border-l border-border',
                role === 'following'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted',
              )}
              onClick={(e) => { e.stopPropagation(); handleUpdateUserTeamRole(user.id, 'following'); }}
            >
              Following
            </button>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (user) => (
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleRemoveUserFromTeam(user.id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const getDefectStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return <Badge variant="default">New</Badge>;
      case 'in_progress':
        return <Badge variant="warning">In Progress</Badge>;
      case 'corrected':
        return <Badge variant="success">Corrected</Badge>;
      case 'no_correction_needed':
        return <Badge variant="outline">No Correction Needed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const SEVERITY_PILL: Record<string, string> = {
    high: 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400',
    medium: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
    low: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
  };
  const SEVERITY_LABEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

  const getDefectSeverityBadge = (priority: string) => (
    <span className={cn(
      'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
      SEVERITY_PILL[priority] || 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
    )}>
      {SEVERITY_LABEL[priority] || priority}
    </span>
  );

  const teamDefectColumns: DataTableColumn<DefectRow>[] = [
    {
      key: 'defectNumber',
      header: 'Defect #',
      label: 'Defect Number',
      render: (defect) => (
        <span className="font-medium text-foreground">{defect.defectNumber}</span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      label: 'Name',
      render: (defect) => (
        <span className="font-medium text-foreground">{defect.name}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      label: 'Status',
      render: (defect) => getDefectStatusBadge(defect.status),
    },
    {
      key: 'priority',
      header: 'Severity',
      label: 'Severity',
      render: (defect) => getDefectSeverityBadge(defect.priority),
    },
    {
      key: 'assetName',
      header: 'Asset',
      label: 'Asset',
      render: (defect) => (
        <span className="text-muted-foreground">{defect.assetName || '—'}</span>
      ),
    },
    {
      key: 'driverName',
      header: 'Driver',
      label: 'Driver',
      render: (defect) => (
        <span className="text-muted-foreground">{defect.driverName || '—'}</span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      label: 'Date',
      render: (defect) => (
        <span className="text-muted-foreground">
          {formatDate(defect.date)}
        </span>
      ),
    },
    {
      key: 'comment',
      header: 'Comment',
      label: 'Comment',
      render: (defect) =>
        defect.comment ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground truncate max-w-[200px] inline-block cursor-default">
                  {defect.comment}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap">
                {defect.comment}
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
      render: (defect) => (
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleRemoveDefectFromTeam(defect.id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  // ── Inspection columns ──
  const teamInspectionColumns: DataTableColumn<InspectionRow>[] = [
    {
      key: 'inspectionNumber',
      header: 'Inspection #',
      label: 'Inspection Number',
      render: (item) => (
        <span className="font-medium text-foreground">{item.inspectionNumber || '—'}</span>
      ),
    },
    {
      key: 'formTitle',
      header: 'Form',
      label: 'Form Title',
      render: (item) => (
        <span className="text-foreground">{item.formTitle || '—'}</span>
      ),
    },
    {
      key: 'assetName',
      header: 'Asset',
      label: 'Asset',
      render: (item) => (
        <span className="text-muted-foreground">{item.assetName || '—'}</span>
      ),
    },
    {
      key: 'operatorName',
      header: 'Operator',
      label: 'Operator',
      render: (item) => (
        <span className="text-muted-foreground">{item.operatorName || '—'}</span>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      label: 'Result',
      render: (item) => (
        <Badge variant={item.result === 'pass' ? 'success' : 'destructive'}>
          {item.result === 'pass' ? 'Pass' : 'Fail'}
        </Badge>
      ),
    },
    {
      key: 'defectCount',
      header: 'Defects',
      label: 'Defect Count',
      align: 'center',
      render: (item) => (
        <span className="text-muted-foreground">{item.defectCount}</span>
      ),
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      label: 'Submitted At',
      render: (item) => (
        <span className="text-muted-foreground">
          {formatDate(item.submittedAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleRemoveInspectionFromTeam(item.id)}
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
        <PageHeader title={headerTitle} count={headerCount}>
          {renderHeaderButton()}
        </PageHeader>

        {/* Tabs - only shown when a specific team is selected */}
        {selectedTeamId && (
          <div className="border-b border-border px-6">
            <div className="flex gap-0">
              {TEAM_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setTabSearch(''); }}
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
                afterControls={
                  <ShowArchivedToggle checked={showArchived} onCheckedChange={setShowArchived} />
                }
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
            <>
              <DataTableToolbar
                columns={teamUserColumns}
                hiddenColumnKeys={teamUsersTable.hiddenColumnKeys}
                onHiddenColumnKeysChange={teamUsersTable.setHiddenColumnKeys}
                density={teamUsersTable.density}
                onDensityChange={teamUsersTable.setDensity}
                searchNode={<SearchInput value={tabSearch} onChange={setTabSearch} placeholder="Search users..." />}
              />
              <DataTable<UserRow>
                columns={teamUserColumns}
                data={teamUsers}
                pagination={teamUsersPagination}
                loading={teamUsersLoading}
                rowsPerPage={teamUsersRowsPerPage}
                onPageChange={fetchTeamUsers}
                onRowsPerPageChange={setTeamUsersRowsPerPage}
                rowKey={(u) => u.id}
                density={teamUsersTable.density}
                hiddenColumnKeys={teamUsersTable.hiddenColumnKeys}
                emptyMessage='No users assigned. Click "Add Users" to assign users to this team.'
              />
            </>
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
                searchNode={<SearchInput value={tabSearch} onChange={setTabSearch} placeholder="Search assets..." />}
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
                searchNode={<SearchInput value={tabSearch} onChange={setTabSearch} placeholder="Search drivers..." />}
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

          {/* Defects tab */}
          {selectedTeamId && activeTab === 'Defects' && (
            <>
              <DataTableToolbar
                columns={teamDefectColumns}
                hiddenColumnKeys={teamDefectsTable.hiddenColumnKeys}
                onHiddenColumnKeysChange={teamDefectsTable.setHiddenColumnKeys}
                density={teamDefectsTable.density}
                onDensityChange={teamDefectsTable.setDensity}
                filterDefs={teamDefectFilterDefs}
                filters={teamDefectsTable.filters}
                onFilterChange={teamDefectsTable.setFilter}
                onFiltersClear={teamDefectsTable.clearFilters}
                searchNode={<SearchInput value={tabSearch} onChange={setTabSearch} placeholder="Search defects..." />}
              />
              <DataTable<DefectRow>
                columns={teamDefectColumns}
                data={filteredTeamDefects}
                pagination={teamDefectsPagination}
                loading={teamDefectsLoading}
                rowsPerPage={teamDefectsRowsPerPage}
                onPageChange={fetchTeamDefects}
                onRowsPerPageChange={setTeamDefectsRowsPerPage}
                rowKey={(d) => d.id}
                density={teamDefectsTable.density}
                hiddenColumnKeys={teamDefectsTable.hiddenColumnKeys}
                emptyMessage='No defects assigned. Click "Add Defects" to assign defects to this team.'
              />
            </>
          )}

          {/* Inspections tab */}
          {selectedTeamId && activeTab === 'Inspections' && (
            <>
              <DataTableToolbar
                columns={teamInspectionColumns}
                hiddenColumnKeys={teamInspectionsTable.hiddenColumnKeys}
                onHiddenColumnKeysChange={teamInspectionsTable.setHiddenColumnKeys}
                density={teamInspectionsTable.density}
                onDensityChange={teamInspectionsTable.setDensity}
                searchNode={<SearchInput value={tabSearch} onChange={setTabSearch} placeholder="Search inspections..." />}
              />
              <DataTable<InspectionRow>
                columns={teamInspectionColumns}
                data={teamInspections}
                pagination={teamInspectionsPagination}
                loading={teamInspectionsLoading}
                rowsPerPage={teamInspectionsRowsPerPage}
                onPageChange={fetchTeamInspections}
                onRowsPerPageChange={setTeamInspectionsRowsPerPage}
                rowKey={(i) => i.id}
                density={teamInspectionsTable.density}
                hiddenColumnKeys={teamInspectionsTable.hiddenColumnKeys}
                emptyMessage='No inspections assigned. Click "Add Inspections" to assign inspections to this team.'
              />
            </>
          )}

          {/* Other tabs */}
          {selectedTeamId && activeTab !== 'Users' && activeTab !== 'Assets' && activeTab !== 'Drivers' && activeTab !== 'Defects' && activeTab !== 'Inspections' && (
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
            <LoadingButton onClick={handleSave} loading={saving}>
              {dialogMode === 'create' ? 'Create' : 'Save'}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Team Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={archivingTeam?.name}
        action={showArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Delete Team Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingTeam?.name}
        onConfirm={handleDelete}
        loading={deleting}
      />

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

      {/* Add Users Dialog */}
      <Dialog open={addUsersDialogOpen} onOpenChange={setAddUsersDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Users</DialogTitle>
            <DialogDescription>Select the users to add to the team.</DialogDescription>
          </DialogHeader>

          <SearchInput
            value={allUsersSearch}
            onChange={setAllUsersSearch}
            placeholder="Search users..."
          />

          <div className="rounded-lg border overflow-hidden mt-2 max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="border-b bg-muted/50">
                  <th className="w-10 px-4 py-3" />
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Name</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Email</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Role</th>
                </tr>
              </thead>
              <tbody>
                {allUsersLoading ? (
                  <TableSkeleton columns={4} rows={5} />
                ) : allUsers.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No users found</td></tr>
                ) : (
                  allUsers.map((user) => {
                    const isAlreadyInTeam = selectedTeamId ? user.teamIds?.includes(selectedTeamId) : false;
                    const isSelected = selectedUserIds.has(user.id);
                    return (
                      <tr
                        key={user.id}
                        className={cn(
                          'border-b last:border-0 transition-colors cursor-pointer',
                          isSelected ? 'bg-primary/5' : 'hover:bg-muted/30',
                          isAlreadyInTeam && 'opacity-50',
                        )}
                        onClick={() => { if (!isAlreadyInTeam) toggleUserSelection(user.id); }}
                      >
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={isSelected || isAlreadyInTeam}
                            disabled={isAlreadyInTeam}
                            onCheckedChange={() => { if (!isAlreadyInTeam) toggleUserSelection(user.id); }}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {user.firstName} {user.lastName}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{user.email || '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{user.roleName || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            page={allUsersPagination.page}
            limit={allUsersRowsPerPage}
            total={allUsersPagination.total}
            onPageChange={fetchAllUsers}
            onRowsPerPageChange={setAllUsersRowsPerPage}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUsersDialogOpen(false)} disabled={addingUsers}>
              Cancel
            </Button>
            <Button onClick={handleAddUsers} disabled={addingUsers || selectedUserIds.size === 0}>
              {addingUsers ? 'Adding...' : `Add Users (${selectedUserIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Defects Dialog */}
      <Dialog open={addDefectsDialogOpen} onOpenChange={setAddDefectsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Defects</DialogTitle>
            <DialogDescription>Select the defects to add to the team.</DialogDescription>
          </DialogHeader>

          <SearchInput
            value={allDefectsSearch}
            onChange={setAllDefectsSearch}
            placeholder="Search defects..."
          />

          <div className="rounded-lg border overflow-hidden mt-2 max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="border-b bg-muted/50">
                  <th className="w-10 px-4 py-3" />
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Defect #</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Name</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Teams</th>
                </tr>
              </thead>
              <tbody>
                {allDefectsLoading ? (
                  <TableSkeleton columns={5} rows={5} />
                ) : allDefects.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No defects found</td></tr>
                ) : (
                  allDefects.map((defect) => {
                    const isAlreadyInTeam = selectedTeamId ? defect.teamIds?.includes(selectedTeamId) : false;
                    const isSelected = selectedDefectIds.has(defect.id);
                    return (
                      <tr
                        key={defect.id}
                        className={cn(
                          'border-b last:border-0 transition-colors cursor-pointer',
                          isSelected ? 'bg-primary/5' : 'hover:bg-muted/30',
                          isAlreadyInTeam && 'opacity-50',
                        )}
                        onClick={() => { if (!isAlreadyInTeam) toggleDefectSelection(defect.id); }}
                      >
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={isSelected || isAlreadyInTeam}
                            disabled={isAlreadyInTeam}
                            onCheckedChange={() => { if (!isAlreadyInTeam) toggleDefectSelection(defect.id); }}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{defect.defectNumber}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{defect.name}</td>
                        <td className="px-4 py-3">{getDefectStatusBadge(defect.status)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {defect.teamNames?.length > 0 ? defect.teamNames.join(', ') : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            page={allDefectsPagination.page}
            limit={allDefectsRowsPerPage}
            total={allDefectsPagination.total}
            onPageChange={fetchAllDefects}
            onRowsPerPageChange={setAllDefectsRowsPerPage}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDefectsDialogOpen(false)} disabled={addingDefects}>
              Cancel
            </Button>
            <Button onClick={handleAddDefects} disabled={addingDefects || selectedDefectIds.size === 0}>
              {addingDefects ? 'Adding...' : `Add Defects (${selectedDefectIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Inspections Dialog */}
      <Dialog open={addInspectionsDialogOpen} onOpenChange={setAddInspectionsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Inspections</DialogTitle>
            <DialogDescription>Select the inspections to add to the team.</DialogDescription>
          </DialogHeader>

          <SearchInput
            value={allInspectionsSearch}
            onChange={setAllInspectionsSearch}
            placeholder="Search inspections..."
          />

          <div className="rounded-lg border overflow-hidden mt-2 max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="border-b bg-muted/50">
                  <th className="w-10 px-4 py-3" />
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Inspection #</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Form</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Asset</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Result</th>
                </tr>
              </thead>
              <tbody>
                {allInspectionsLoading ? (
                  <TableSkeleton columns={5} rows={5} />
                ) : allInspections.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No inspections found</td></tr>
                ) : (
                  allInspections.map((inspection) => {
                    const isAlreadyInTeam = selectedTeamId ? inspection.teamIds?.includes(selectedTeamId) : false;
                    const isSelected = selectedInspectionIds.has(inspection.id);
                    return (
                      <tr
                        key={inspection.id}
                        className={cn(
                          'border-b last:border-0 transition-colors cursor-pointer',
                          isSelected ? 'bg-primary/5' : 'hover:bg-muted/30',
                          isAlreadyInTeam && 'opacity-50',
                        )}
                        onClick={() => { if (!isAlreadyInTeam) toggleInspectionSelection(inspection.id); }}
                      >
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={isSelected || isAlreadyInTeam}
                            disabled={isAlreadyInTeam}
                            onCheckedChange={() => { if (!isAlreadyInTeam) toggleInspectionSelection(inspection.id); }}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{inspection.inspectionNumber || '—'}</td>
                        <td className="px-4 py-3 text-foreground">{inspection.formTitle}</td>
                        <td className="px-4 py-3 text-muted-foreground">{inspection.assetName || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={inspection.result === 'pass' ? 'success' : 'destructive'}>
                            {inspection.result === 'pass' ? 'Pass' : 'Fail'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            page={allInspectionsPagination.page}
            limit={allInspectionsRowsPerPage}
            total={allInspectionsPagination.total}
            onPageChange={fetchAllInspections}
            onRowsPerPageChange={setAllInspectionsRowsPerPage}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddInspectionsDialogOpen(false)} disabled={addingInspections}>
              Cancel
            </Button>
            <Button onClick={handleAddInspections} disabled={addingInspections || selectedInspectionIds.size === 0}>
              {addingInspections ? 'Adding...' : `Add Inspections (${selectedInspectionIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
