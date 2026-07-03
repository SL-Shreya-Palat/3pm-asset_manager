'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  User,
  Eye,
  ClipboardCheck,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { PageHeader } from '@/components/ui/page-header';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import { Spinner } from '@/components/ui/spinner';
import type { DriverRow, TeamOption, Pagination } from './types';

export function DriversPage() {
  const router = useRouter();
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Table features
  const {
    hiddenColumnKeys, setHiddenColumnKeys,
    density, setDensity,
  } = useDataTable();

  // Teams for display
  const [teams, setTeams] = useState<TeamOption[]>([]);

  // Inspect dialog
  const [inspectDialogOpen, setInspectDialogOpen] = useState(false);
  const [inspectDriver, setInspectDriver] = useState<DriverRow | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectForms, setInspectForms] = useState<{ formId: string; title: string }[]>([]);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingDriver, setDeletingDriver] = useState<DriverRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch drivers ──
  const fetchDrivers = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await axios.get(`/api/drivers?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setDrivers(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch drivers:', err);
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage, debouncedSearch]);

  useEffect(() => {
    fetchDrivers(1);
  }, [fetchDrivers]);

  // Fetch teams for display
  useEffect(() => {
    async function loadTeams() {
      try {
        const res = await axios.get('/api/teams?limit=100', { withCredentials: true });
        setTeams(res.data.data?.items || []);
      } catch {
        setTeams([]);
      }
    }
    loadTeams();
  }, []);

  const handleOpenDelete = (driver: DriverRow) => {
    setDeletingDriver(driver);
    setDeleteDialogOpen(true);
  };

  // ── Inspection ──
  const handleOpenInspect = async (driver: DriverRow) => {
    setInspectDriver(driver);
    setInspectDialogOpen(true);
    setInspectLoading(true);
    try {
      // Auto-seed pre-start forms (idempotent — skips if already seeded)
      await axios.post('/api/forms/seed-prestart', {}, { withCredentials: true }).catch(() => {});
      const res = await axios.get('/api/forms?status=published&includeSchema=false', { withCredentials: true });
      const allForms = res.data?.data?.items || [];
      const wellness = allForms
        .filter(
          (f: Record<string, unknown>) =>
            (f.title || f.formTitle) === 'Driver Wellness Pre-Start Check',
        )
        .map((f: Record<string, unknown>) => ({
          formId: String(f.formId || f.id),
          title: String(f.title || f.formTitle || 'Untitled form'),
        }));
      setInspectForms(wellness);
    } catch {
      setInspectForms([]);
    } finally {
      setInspectLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingDriver) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/drivers/${deletingDriver.id}`, { withCredentials: true });
      setDeleteDialogOpen(false);
      setDeletingDriver(null);
      fetchDrivers(pagination.page);
    } catch (err) {
      console.error('Failed to delete driver:', err);
    } finally {
      setDeleting(false);
    }
  };

  // ── Team name helper ──
  const getTeamName = (teamId?: string) => {
    if (!teamId) return '—';
    const team = teams.find((t) => t.id === teamId);
    return team?.name || '—';
  };

  // ── Navigate to driver detail page ──
  const handleViewDriver = (driver: DriverRow) => {
    router.push(`/people/drivers/${driver.id}`);
  };

  // ── Column definitions ──
  const driverColumns: DataTableColumn<DriverRow>[] = [
    {
      key: 'name',
      header: 'Driver',
      label: 'Driver Name',
      pinned: true,
      sortable: true,
      sortValue: (driver) => `${driver.firstName} ${driver.lastName}`,
      render: (driver) => (
        <div className="flex items-center gap-3">
          {driver.photoUrl ? (
            <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden">
              <img src={driver.photoUrl} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-4 w-4" />
            </div>
          )}
          <span className="font-medium text-foreground">
            {driver.firstName} {driver.lastName}
          </span>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      label: 'Email',
      sortable: true,
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
      key: 'teamId',
      header: 'Team',
      label: 'Team',
      sortable: true,
      sortValue: (driver) => getTeamName(driver.teamId),
      render: (driver) => (
        <span className="text-muted-foreground">{getTeamName(driver.teamId)}</span>
      ),
    },
    {
      key: 'licenseNumber',
      header: 'License #',
      label: 'License Number',
      sortable: true,
      render: (driver) => (
        <span className="text-muted-foreground">{driver.licenseNumber || '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (driver) => (
        <RowActions>
          <RowActionButton label="Inspect" icon={<ClipboardCheck />} onClick={() => handleOpenInspect(driver)} />
          <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => handleViewDriver(driver)} />
          <RowActionButton label="Edit" icon={<Pencil />} onClick={() => router.push(`/people/drivers/${driver.id}/edit`)} />
          <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(driver)} />
        </RowActions>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PageHeader title="Drivers" count={pagination.total}>
        <Button onClick={() => router.push('/people/drivers/new')}>
          <Plus className="h-4 w-4" />
          Add Driver
        </Button>
      </PageHeader>

      {/* Toolbar + Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <DataTableToolbar
          columns={driverColumns}
          hiddenColumnKeys={hiddenColumnKeys}
          onHiddenColumnKeysChange={setHiddenColumnKeys}
          density={density}
          onDensityChange={setDensity}
          searchNode={
            <SearchInput value={search} onChange={setSearch} placeholder="Search drivers..." />
          }
        />
        <DataTable<DriverRow>
          columns={driverColumns}
          data={drivers}
          pagination={pagination}
          loading={loading}
          rowsPerPage={rowsPerPage}
          onPageChange={fetchDrivers}
          onRowsPerPageChange={setRowsPerPage}
          onRowClick={handleViewDriver}
          rowKey={(d) => d.id}
          density={density}
          hiddenColumnKeys={hiddenColumnKeys}
          emptyMessage={
            debouncedSearch
              ? 'No drivers match your search.'
              : 'No drivers yet. Click "Add Driver" to create one.'
          }
        />
      </div>

      {/* Delete Driver Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Driver</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingDriver?.firstName} {deletingDriver?.lastName}&quot;? This action cannot be undone.
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

      {/* Inspect Driver Dialog */}
      <Dialog open={inspectDialogOpen} onOpenChange={setInspectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Inspection</DialogTitle>
            <DialogDescription>
              {inspectDriver
                ? `Select a form to inspect ${inspectDriver.firstName} ${inspectDriver.lastName}.`
                : 'Select a form to begin the inspection.'}
            </DialogDescription>
          </DialogHeader>

          {inspectLoading ? (
            <div className="flex items-center justify-center py-10"><Spinner /></div>
          ) : inspectForms.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No inspection forms found. Please seed pre-start forms first.
            </p>
          ) : (
            <div className="space-y-2 py-1 max-h-80 overflow-y-auto">
              {inspectForms.map((f) => (
                <button
                  key={f.formId}
                  onClick={() => {
                    setInspectDialogOpen(false);
                    router.push(`/inspections/fill?driverId=${inspectDriver?.id}&formId=${f.formId}`);
                  }}
                  className="w-full flex items-center gap-3 rounded-md border p-3 text-left hover:bg-muted transition-colors"
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{f.title}</span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
