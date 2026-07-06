'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Plus,
  Edit,
  Archive,
  ArchiveRestore,
  Trash2,
  Eye,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { ShowArchivedToggle } from '@/components/ui/show-archived-toggle';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import { isWildcardPermissions } from '@/lib/rbac';
import type { RoleRow, Pagination } from './types';

export function RolesPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<RoleRow[]>([]);
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

  // Archive state
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingRole, setArchivingRole] = useState<RoleRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRole, setDeletingRole] = useState<RoleRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRoles = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (showArchived) params.set('showArchived', 'true');
      const res = await axios.get(`/api/roles?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setRoles(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch roles:', err);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage, debouncedSearch, showArchived]);

  useEffect(() => {
    fetchRoles(1);
  }, [fetchRoles]);

  // Archive handlers
  const handleOpenArchive = (role: RoleRow) => {
    setArchivingRole(role);
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    if (!archivingRole) return;
    setArchiving(true);
    try {
      const archived = !showArchived; // If viewing active items, we archive. If viewing archived, we unarchive.
      await axios.patch(`/api/roles/${archivingRole.id}/archive`, { archived }, { withCredentials: true });
      setArchiveDialogOpen(false);
      setArchivingRole(null);
      fetchRoles(pagination.page);
    } catch (err) {
      console.error('Failed to archive/unarchive role:', err);
    } finally {
      setArchiving(false);
    }
  };

  // Delete handlers
  const handleOpenDelete = (role: RoleRow) => {
    setDeletingRole(role);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingRole) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/roles/${deletingRole.id}`, { withCredentials: true });
      setDeleteDialogOpen(false);
      setDeletingRole(null);
      fetchRoles(pagination.page);
    } catch (err) {
      console.error('Failed to delete role:', err);
    } finally {
      setDeleting(false);
    }
  };

  /** Summarize permissions for the table column. */
  const getPermissionSummary = (role: RoleRow): string => {
    if (isWildcardPermissions(role.permissions)) return 'Full Access';
    const moduleCount = Array.isArray(role.permissions.m)
      ? role.permissions.m.filter((k) => k !== '*').length
      : 0;
    return `${moduleCount} module${moduleCount !== 1 ? 's' : ''}`;
  };

  const roleColumns: DataTableColumn<RoleRow>[] = [
    {
      key: 'name',
      header: 'Role',
      label: 'Role Name',
      pinned: true,
      render: (role) => (
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            role.isSystem ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}>
            {role.isSystem ? <ShieldCheck className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
          </div>
          <div>
            <span className="font-medium text-foreground">{role.name}</span>
            {role.isSystem && (
              <Badge variant="secondary" className="ml-2 text-xs">System</Badge>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      label: 'Description',
      render: (role) => {
        const desc = role.description || '—';
        if (!role.description) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground block max-w-[300px] truncate">
                  {desc}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p>{desc}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      key: 'permissions',
      header: 'Permissions',
      label: 'Permissions',
      render: (role) => (
        <Badge variant={isWildcardPermissions(role.permissions) ? 'default' : 'outline'}>
          {getPermissionSummary(role)}
        </Badge>
      ),
    },
    {
      key: 'teamScoped',
      header: 'Team Scoped',
      label: 'Team Scoped',
      render: (role) => (
        <span className="text-muted-foreground">
          {role.teamScoped ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (role) => (
        <RowActions>
          {!showArchived && (
            <>
              <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => router.push(`/people/roles/${role.id}`)} />
              {!role.isSystem && (
                <>
                  <RowActionButton label="Edit" icon={<Edit />} onClick={() => router.push(`/people/roles/${role.id}/edit`)} />
                  <RowActionButton label="Archive" icon={<Archive />} onClick={() => handleOpenArchive(role)} />
                </>
              )}
            </>
          )}
          {showArchived && (
            <>
              <RowActionButton label="Unarchive" icon={<ArchiveRestore />} onClick={() => handleOpenArchive(role)} />
              <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(role)} />
            </>
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PageHeader title="Roles and Permissions" description="Manage roles and configure module-level access for your team" count={pagination.total}>
        <Button onClick={() => router.push('/people/roles/new')}>
          <Plus className="h-4 w-4" />
          Add Role
        </Button>
      </PageHeader>

      <div className="px-6 pb-3">
        <ShowArchivedToggle checked={showArchived} onCheckedChange={setShowArchived} />
      </div>

      {/* Toolbar + Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <DataTableToolbar
          columns={roleColumns}
          hiddenColumnKeys={hiddenColumnKeys}
          onHiddenColumnKeysChange={setHiddenColumnKeys}
          density={density}
          onDensityChange={setDensity}
          searchNode={
            <SearchInput value={search} onChange={setSearch} placeholder="Search roles..." />
          }
        />
        <DataTable<RoleRow>
          columns={roleColumns}
          data={roles}
          pagination={pagination}
          loading={loading}
          rowsPerPage={rowsPerPage}
          onPageChange={fetchRoles}
          onRowsPerPageChange={setRowsPerPage}
          onRowClick={showArchived ? undefined : (role) => router.push(`/people/roles/${role.id}`)}
          rowKey={(r) => r.id}
          density={density}
          hiddenColumnKeys={hiddenColumnKeys}
          emptyMessage={
            debouncedSearch
              ? 'No roles match your search.'
              : 'No roles yet. Click "Add Role" to create one.'
          }
        />
      </div>

      {/* Archive Role Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={archivingRole?.name}
        action={showArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Delete Role Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingRole?.name}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
