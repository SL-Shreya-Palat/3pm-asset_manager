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
import { cn } from '@/lib/utils';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import type { DriverRow, TeamOption, Pagination } from './types';

const FORM_TABS = ['Personal', 'Details'] as const;
type FormTab = (typeof FORM_TABS)[number];

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

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewDriver, setViewDriver] = useState<DriverRow | null>(null);
  const [viewTab, setViewTab] = useState<FormTab>('Personal');

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

  const handleOpenView = (driver: DriverRow) => {
    setViewDriver(driver);
    setViewTab('Personal');
    setViewDialogOpen(true);
  };

  const handleOpenDelete = (driver: DriverRow) => {
    setDeletingDriver(driver);
    setDeleteDialogOpen(true);
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

  // ── Column definitions ──
  const driverColumns: DataTableColumn<DriverRow>[] = [
    {
      key: 'name',
      header: 'Driver',
      label: 'Driver Name',
      pinned: true,
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
      render: (driver) => (
        <span className="text-muted-foreground">{getTeamName(driver.teamId)}</span>
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
        <RowActions>
          <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => handleOpenView(driver)} />
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
            <SearchInput value={search} onChange={setSearch} placeholder="Search drivers..." className="max-w-sm w-full" />
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
          onRowClick={handleOpenView}
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

      {/* View Driver Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {viewDriver ? `${viewDriver.firstName} ${viewDriver.lastName}` : 'Driver Details'}
            </DialogTitle>
            <DialogDescription>Driver information overview.</DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="border-b border-border">
            <div className="flex gap-0">
              {FORM_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setViewTab(tab)}
                  className={cn(
                    'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                    viewTab === tab
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* View content */}
          <div className="flex-1 overflow-y-auto py-4">
            {viewDriver && (
              <ViewDriverContent
                viewForm={{
                  firstName: viewDriver.firstName,
                  lastName: viewDriver.lastName,
                  email: viewDriver.email || '',
                  photoUrl: viewDriver.photoUrl || '',
                  notes: viewDriver.notes || '',
                  teamId: viewDriver.teamId || '',
                  mobileNumber: viewDriver.mobileNumber || '',
                  homePhone: viewDriver.homePhone || '',
                  workPhone: viewDriver.workPhone || '',
                  dateOfBirth: viewDriver.dateOfBirth ? viewDriver.dateOfBirth.split('T')[0] : '',
                  employeeNumber: viewDriver.employeeNumber || '',
                  jobPosition: viewDriver.jobPosition || '',
                  ratePerUnit: viewDriver.ratePerUnit !== undefined ? String(viewDriver.ratePerUnit) : '',
                  otherNotes: viewDriver.otherNotes || '',
                  driverLicense: viewDriver.driverLicense || '',
                  licenseClass: viewDriver.licenseClass || '',
                  licenseNumber: viewDriver.licenseNumber || '',
                  healthCertificate: viewDriver.healthCertificate || '',
                }}
                viewTab={viewTab}
                getTeamName={getTeamName}
              />
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setViewDialogOpen(false);
                if (viewDriver) router.push(`/people/drivers/${viewDriver.id}/edit`);
              }}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}

/** Read-only view of driver details. */
function ViewDriverContent({
  viewForm,
  viewTab,
  getTeamName,
}: {
  viewForm: Record<string, string>;
  viewTab: FormTab;
  getTeamName: (id?: string) => string;
}) {
  if (viewTab === 'Personal') {
    return (
      <div className="space-y-4">
        {/* Photo */}
        <div className="flex items-center gap-4">
          {viewForm.photoUrl ? (
            <div className="h-16 w-16 rounded-full overflow-hidden border">
              <img src={viewForm.photoUrl} alt="Driver" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center border">
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ViewField label="First Name" value={viewForm.firstName} />
          <ViewField label="Last Name" value={viewForm.lastName} />
        </div>
        <ViewField label="Email" value={viewForm.email} />
        <ViewField label="Team" value={getTeamName(viewForm.teamId)} />
        <div className="grid grid-cols-3 gap-4">
          <ViewField label="Mobile Number" value={viewForm.mobileNumber} />
          <ViewField label="Home Phone" value={viewForm.homePhone} />
          <ViewField label="Work Phone" value={viewForm.workPhone} />
        </div>
        <ViewField label="Date of Birth" value={viewForm.dateOfBirth} />
        <ViewField label="Notes" value={viewForm.notes} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ViewField label="Employee Number" value={viewForm.employeeNumber} />
        <ViewField label="Job Position" value={viewForm.jobPosition} />
      </div>
      <ViewField label="Rate per mi/hr" value={viewForm.ratePerUnit} />
      <ViewField label="Driver License" value={viewForm.driverLicense} />
      <div className="grid grid-cols-2 gap-4">
        <ViewField label="License Class" value={viewForm.licenseClass} />
        <ViewField label="License Number" value={viewForm.licenseNumber} />
      </div>
      <ViewField label="Health Certificate" value={viewForm.healthCertificate} />
      <ViewField label="Other Notes" value={viewForm.otherNotes} />
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
