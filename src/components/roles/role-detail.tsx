'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Edit,
  Archive,
  Shield,
  ShieldCheck,
  Info,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DetailCard, DetailField } from '@/components/ui/detail-field';
import {
  DetailPageHeader,
  DetailPageHeaderSkeleton,
} from '@/components/ui/detail-page-header';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { cn } from '@/lib/utils';
import { isWildcardPermissions } from '@/lib/rbac';
import { expandPermissionsForUI } from './utils/permissionFormatAdapter';
import type { RoleRow } from './types';

// ---------------------------------------------------------------------------
// Level badge (shared with view)
// ---------------------------------------------------------------------------

const LEVEL_BADGE_STYLES: Record<string, string> = {
  all: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  own: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  none: '',
};

function LevelBadge({ level }: { level: string }) {
  if (level === 'none') {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const style = LEVEL_BADGE_STYLES[level] || '';
  return (
    <span className={cn('inline-block rounded px-1.5 py-0.5 text-xs font-medium border', style)}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RoleDetail() {
  const params = useParams();
  const router = useRouter();
  const [role, setRole] = useState<RoleRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const fetchRole = useCallback(async () => {
    try {
      const res = await axios.get(`/api/roles/${params.id}`, { withCredentials: true });
      setRole(res.data.data);
    } catch {
      setRole(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) fetchRole();
  }, [params.id, fetchRole]);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await axios.patch(`/api/roles/${params.id}/archive`, { archived: true }, { withCredentials: true });
      router.push('/roles');
    } catch {
      // silent
    } finally {
      setArchiving(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="p-6 max-w-4xl">
        <DetailPageHeaderSkeleton />
      </div>
    );
  }

  // Not found
  if (!role) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Role not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/people/roles')}>
          Back to Roles
        </Button>
      </div>
    );
  }

  const isFullAccess = isWildcardPermissions(role.permissions);
  const modules = isFullAccess ? [] : expandPermissionsForUI(role.permissions);

  return (
    <div className="p-6 max-w-4xl">
      <DetailPageHeader
        backHref="/people/roles"
        backLabel="Back to Roles"
        icon={role.isSystem ? ShieldCheck : Shield}
        iconClassName={role.isSystem ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}
        title={role.name}
        badges={
          <>
            {role.isSystem && <Badge variant="secondary">System</Badge>}
            {role.teamScoped && <Badge variant="outline">Team Scoped</Badge>}
            {role.mobileOnly && <Badge variant="outline">Mobile Only</Badge>}
          </>
        }
        actions={
          !role.isSystem ? (
            <>
              <Button variant="outline" onClick={() => router.push(`/people/roles/${role.id}/edit`)}>
                <Edit className="h-4 w-4" />
                Edit
              </Button>
              <Button variant="secondary" onClick={() => setArchiveDialogOpen(true)}>
                <Archive className="h-4 w-4" />
                Archive
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Overview */}
      <DetailCard icon={Info} title="Overview" columns={2}>
        <DetailField label="Description" value={role.description} />
        <DetailField label="Team Scoped" value={role.teamScoped ? 'Yes' : 'No'} />
        <DetailField label="Mobile Only" value={role.mobileOnly ? 'Yes' : 'No'} />
        <DetailField
          label="Created"
          value={role.createdAt ? new Date(role.createdAt).toLocaleDateString() : undefined}
        />
      </DetailCard>

      {/* Permissions */}
      <section className="rounded-sm border bg-card p-5 shadow-sm mt-6">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Lock className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">Permissions</h2>
        </div>

        {isFullAccess ? (
          <div className="rounded-md bg-primary/5 border border-primary/20 p-4">
            <p className="text-sm font-medium text-primary">Full Access</p>
            <p className="text-sm text-muted-foreground mt-1">
              This role has unrestricted access to all modules and actions.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {modules.map((mod) => {
              if (!mod.view) return null;
              const allForms = mod.subModules.flatMap((sm) => sm.forms);
              const hasAnyPermission = allForms.some(
                (f) => f.viewLevel !== 'none' || f.create,
              );
              if (!hasAnyPermission) return null;

              return (
                <div key={mod.key}>
                  <h3 className="text-sm font-semibold text-foreground mb-2">{mod.name}</h3>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Form</th>
                          <th className="text-center px-2 py-2 font-medium text-muted-foreground">View</th>
                          <th className="text-center px-2 py-2 font-medium text-muted-foreground">Create</th>
                          <th className="text-center px-2 py-2 font-medium text-muted-foreground">Update</th>
                          <th className="text-center px-2 py-2 font-medium text-muted-foreground">Archive/Unarchive</th>
                          <th className="text-center px-2 py-2 font-medium text-muted-foreground">Delete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allForms.map((form) => {
                          if (form.viewLevel === 'none' && !form.create) return null;
                          return (
                            <tr key={form.key} className="border-t">
                              <td className="px-3 py-2 font-medium">{form.name}</td>
                              <td className="text-center px-2 py-2">
                                <LevelBadge level={form.viewLevel} />
                              </td>
                              <td className="text-center px-2 py-2">
                                {form.accessibility.includes('create') ? (
                                  form.create ? (
                                    <span className="text-green-600 font-semibold text-xs">Yes</span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">No</span>
                                  )
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </td>
                              <td className="text-center px-2 py-2">
                                {form.accessibility.includes('edit') ? (
                                  <LevelBadge level={form.editLevel} />
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </td>
                              <td className="text-center px-2 py-2">
                                {form.accessibility.includes('archive') ? (
                                  <LevelBadge level={form.archiveLevel} />
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </td>
                              <td className="text-center px-2 py-2">
                                {form.accessibility.includes('delete') ? (
                                  <LevelBadge level={form.deleteLevel} />
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </td>
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
        )}
      </section>

      {/* Archive dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={role.name}
        action="archive"
        onConfirm={handleArchive}
        loading={archiving}
      />
    </div>
  );
}
