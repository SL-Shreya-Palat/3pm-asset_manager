'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Plus,
  Trash2,
  Eye,
  User,
  Archive,
  ArchiveRestore,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RowActions, RowActionButton } from '@/components/ui/row-actions';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { ShowArchivedToggle } from '@/components/ui/show-archived-toggle';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { InviteUserDialog } from './invite-user-dialog';
import type { UserRow, Pagination } from './types';

export function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Invite dialog
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  // Archive state
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingUser, setArchivingUser] = useState<UserRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch users ──
  const fetchUsers = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (showArchived) params.set('showArchived', 'true');
      const res = await axios.get(`/api/users?${params.toString()}`, { withCredentials: true });
      const data = res.data.data;
      setUsers(data.items || []);
      setPagination(data.pagination || { page: 1, limit: rowsPerPage, total: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage, debouncedSearch, showArchived]);

  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

  // Archive handlers
  const handleOpenArchive = (user: UserRow) => {
    setArchivingUser(user);
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    if (!archivingUser) return;
    setArchiving(true);
    try {
      const archived = !showArchived; // If viewing active items, we archive. If viewing archived, we unarchive.
      await axios.patch(`/api/users/${archivingUser.id}/archive`, { archived }, { withCredentials: true });
      setArchiveDialogOpen(false);
      setArchivingUser(null);
      fetchUsers(pagination.page);
    } catch (err) {
      console.error('Failed to archive/unarchive user:', err);
    } finally {
      setArchiving(false);
    }
  };

  // Delete handlers
  const handleOpenDelete = (user: UserRow) => {
    setDeletingUser(user);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/users/${deletingUser.id}`, { withCredentials: true });
      setDeleteDialogOpen(false);
      setDeletingUser(null);
      fetchUsers(pagination.page);
    } catch (err) {
      console.error('Failed to delete user:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleInviteSuccess = () => {
    setInviteDialogOpen(false);
    fetchUsers(1);
  };

  // ── Column definitions ──
  const userColumns: DataTableColumn<UserRow>[] = [
    {
      key: 'name',
      header: 'Name',
      pinned: true,
      sortable: true,
      sortValue: (user) => `${user.firstName} ${user.lastName}`,
      render: (user) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground">
            {user.firstName} {user.lastName}
          </span>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      render: (user) => (
        <span className="text-muted-foreground">{user.email || '—'}</span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      sortValue: (user) => user.roleName || null,
      render: (user) => (
        <span className="text-muted-foreground">{user.roleName || '—'}</span>
      ),
    },
    {
      key: 'mobileNumber',
      header: 'Mobile',
      render: (user) => (
        <span className="text-muted-foreground">{user.mobileNumber || '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (user) => (
        <Badge variant={user.isActive ? 'success' : 'secondary'}>
          {user.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (user) => (
        <RowActions>
          {!showArchived && (
            <>
              <RowActionButton label="View" tone="primary" icon={<Eye />} onClick={() => router.push(`/people/users/${user.id}`)} />
              <RowActionButton label="Archive" icon={<Archive />} onClick={() => handleOpenArchive(user)} />
            </>
          )}
          {showArchived && (
            <>
              <RowActionButton label="Unarchive" icon={<ArchiveRestore />} onClick={() => handleOpenArchive(user)} />
              <RowActionButton label="Delete" tone="destructive" icon={<Trash2 />} onClick={() => handleOpenDelete(user)} />
            </>
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PageHeader title="Users" description="Invite, manage, and assign roles to your team members" count={pagination.total}>
        <Button onClick={() => setInviteDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Invite User
        </Button>
      </PageHeader>

      {/* Show Archived Toggle + Search */}
      <div className="px-6 pb-4 flex items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search users..."
          className="max-w-sm"
        />
        <ShowArchivedToggle checked={showArchived} onCheckedChange={setShowArchived} />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <DataTable<UserRow>
          columns={userColumns}
          data={users}
          pagination={pagination}
          loading={loading}
          rowsPerPage={rowsPerPage}
          onPageChange={fetchUsers}
          onRowsPerPageChange={setRowsPerPage}
          onRowClick={showArchived ? undefined : (user) => router.push(`/people/users/${user.id}`)}
          rowKey={(u) => u.id}
          emptyMessage={
            debouncedSearch
              ? 'No users match your search.'
              : 'No users yet. Click "Invite User" to add one.'
          }
        />
      </div>

      {/* Invite User Dialog */}
      <InviteUserDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onSuccess={handleInviteSuccess}
      />

      {/* Archive User Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={archivingUser ? `${archivingUser.firstName} ${archivingUser.lastName}` : undefined}
        action={showArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Delete User Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingUser ? `${deletingUser.firstName} ${deletingUser.lastName}` : undefined}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
