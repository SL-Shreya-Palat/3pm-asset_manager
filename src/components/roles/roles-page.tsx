'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import { PERMISSION_TABS, ALL_ACTIONS } from './role-form';
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

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewRole, setViewRole] = useState<RoleRow | null>(null);

  // Delete dialog
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
  }, [rowsPerPage, debouncedSearch]);

  useEffect(() => {
    fetchRoles(1);
  }, [fetchRoles]);

  const handleOpenView = (role: RoleRow) => {
    setViewRole(role);
    setViewDialogOpen(true);
  };

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

  /** Count how many modules have at least one permission enabled. */
  const getPermissionSummary = (role: RoleRow): string => {
    if (role.permissions.scope === 'all') return 'Full Access';
    const modules = role.permissions.modules || {};
    const count = Object.keys(modules).filter((mod) => {
      const actions = modules[mod as keyof typeof modules];
      return actions && Object.values(actions).some(Boolean);
    }).length;
    return `${count} module${count !== 1 ? 's' : ''}`;
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
      render: (role) => (
        <span className="text-muted-foreground">{role.description || '—'}</span>
      ),
    },
    {
      key: 'permissions',
      header: 'Permissions',
      label: 'Permissions',
      render: (role) => (
        <Badge variant={role.permissions.scope === 'all' ? 'default' : 'outline'}>
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
          {role.permissions.scope === 'all' ? 'No' : role.permissions.teamScoped ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (role) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" onClick={() => handleOpenView(role)}>
            <Eye className="h-4 w-4" />
          </Button>
          {!role.isSystem && (
            <>
              <Button variant="ghost" size="icon-sm" onClick={() => router.push(`/people/roles/${role.id}/edit`)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => handleOpenDelete(role)} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h1 className="text-2xl font-semibold text-foreground">
          Roles
          <span className="text-muted-foreground font-normal ml-2">({pagination.total})</span>
        </h1>
        <Button onClick={() => router.push('/people/roles/new')}>
          <Plus className="h-4 w-4" />
          Add Role
        </Button>
      </div>

      {/* Search */}
      <div className="px-6 pb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search roles..."
        />
      </div>

      {/* Toolbar + Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <DataTableToolbar
          columns={roleColumns}
          hiddenColumnKeys={hiddenColumnKeys}
          onHiddenColumnKeysChange={setHiddenColumnKeys}
          density={density}
          onDensityChange={setDensity}
        />
        <DataTable<RoleRow>
          columns={roleColumns}
          data={roles}
          pagination={pagination}
          loading={loading}
          rowsPerPage={rowsPerPage}
          onPageChange={fetchRoles}
          onRowsPerPageChange={setRowsPerPage}
          onRowClick={handleOpenView}
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

      {/* View Role Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {viewRole ? viewRole.name : 'Role Details'}
              {viewRole?.isSystem && (
                <Badge variant="secondary" className="ml-2 text-xs">System</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {viewRole?.description || 'Role permission overview.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {viewRole && <ViewRolePermissions role={viewRole} />}
          </div>

          <DialogFooter>
            {viewRole && !viewRole.isSystem && (
              <Button
                variant="outline"
                onClick={() => {
                  setViewDialogOpen(false);
                  router.push(`/people/roles/${viewRole.id}/edit`);
                }}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Role</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingRole?.name}&quot;? This action cannot be undone.
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

/** Read-only view of role permissions. */
function ViewRolePermissions({ role }: { role: RoleRow }) {
  if (role.permissions.scope === 'all') {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-primary/5 border border-primary/20 p-4">
          <p className="text-sm font-medium text-primary">Full Access</p>
          <p className="text-sm text-muted-foreground mt-1">
            This role has unrestricted access to all modules and actions.
          </p>
        </div>
      </div>
    );
  }

  const { modules, teamScoped, mobileOnly } = role.permissions;

  return (
    <div className="space-y-4">
      {/* Flags */}
      <div className="flex gap-3">
        {teamScoped && <Badge variant="outline">Team Scoped</Badge>}
        {mobileOnly && <Badge variant="outline">Mobile Only</Badge>}
        {!teamScoped && !mobileOnly && (
          <span className="text-sm text-muted-foreground">No restrictions</span>
        )}
      </div>

      <Separator />

      {/* Permission grid */}
      {PERMISSION_TABS.map((tab) => {
        const hasAny = tab.modules.some((mod) => {
          const perms = modules[mod.key];
          return perms && Object.values(perms).some(Boolean);
        });
        if (!hasAny) return null;

        return (
          <div key={tab.key}>
            <h3 className="text-sm font-semibold text-foreground mb-2">{tab.label}</h3>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Module</th>
                    {ALL_ACTIONS.map((a) => (
                      <th key={a.key} className="text-center px-2 py-2 font-medium text-muted-foreground">
                        {a.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tab.modules.map((mod) => {
                    const perms = modules[mod.key];
                    if (!perms || !Object.values(perms).some(Boolean)) return null;
                    return (
                      <tr key={mod.key} className="border-t">
                        <td className="px-3 py-2 font-medium">{mod.label}</td>
                        {ALL_ACTIONS.map((a) => (
                          <td key={a.key} className="text-center px-2 py-2">
                            {perms[a.key] ? (
                              <span className="text-primary font-bold">&#10003;</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
