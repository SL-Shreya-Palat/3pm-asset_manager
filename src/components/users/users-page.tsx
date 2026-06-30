'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Plus,
  Trash2,
  ChevronRight,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
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

  // Delete dialog
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
  }, [rowsPerPage, debouncedSearch]);

  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

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
      render: (user) => (
        <span className="text-muted-foreground">{user.email || '—'}</span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
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
        <Badge variant={user.isActive ? 'default' : 'secondary'}>
          {user.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (user) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" className="cursor-pointer text-destructive hover:text-destructive" onClick={() => handleOpenDelete(user)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="cursor-pointer" onClick={() => router.push(`/people/users/${user.id}`)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PageHeader title="Users" count={pagination.total}>
        <Button onClick={() => setInviteDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Invite User
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="px-6 pb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search users..."
        />
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
          onRowClick={(user) => router.push(`/people/users/${user.id}`)}
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

      {/* Delete User Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingUser?.firstName} {deletingUser?.lastName}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
