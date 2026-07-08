'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Edit,
  Archive,
  ClipboardList,
  DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DetailCard, DetailField } from '@/components/ui/detail-field';
import {
  DetailPageHeader,
  DetailPageHeaderSkeleton,
} from '@/components/ui/detail-page-header';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { checkRecordOwnership } from '@/lib/rbac';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Permissions } from '@/consts/permissions';
import { ServiceTaskForm } from './service-task-form';
import type { ServiceTaskRow } from './types';

const SERVICE_TASK_FORM_ID = 'maintenance.serviceTasks.serviceTask';

export function ServiceTaskDetail() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { hasFullAccess, permissionIndex } = useRoleAccess();
  const editLevel = hasFullAccess ? 'ALL' : permissionIndex.getEditLevel(SERVICE_TASK_FORM_ID);
  const archiveLevel = hasFullAccess ? 'ALL' : permissionIndex.getArchiveLevel(SERVICE_TASK_FORM_ID);

  const [task, setTask] = useState<ServiceTaskRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit panel
  const [panelOpen, setPanelOpen] = useState(false);

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const fetchTask = useCallback(async () => {
    try {
      const res = await axios.get(`/api/service-tasks/${params.id}`, { withCredentials: true });
      setTask(res.data.data);
    } catch {
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) fetchTask();
  }, [params.id, fetchTask]);

  const handleOpenEdit = () => {
    setPanelOpen(true);
  };

  const handleClosePanel = () => {
    setPanelOpen(false);
  };

  const handleSaved = () => {
    handleClosePanel();
    fetchTask();
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await axios.patch(`/api/service-tasks/${params.id}/archive`, { archived: true }, { withCredentials: true });
      router.push('/maintenance/service-tasks');
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
  if (!task) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Service task not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/maintenance/service-tasks')}>
          Back to Service Tasks
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <DetailPageHeader
        backHref="/maintenance/service-tasks"
        backLabel="Back to Service Tasks"
        icon={ClipboardList}
        title={task.title}
        actions={
          <>
            {checkRecordOwnership(editLevel, task.createdBy, user?.id) && (
              <PermissionGuard permission={Permissions.maintenance.serviceTasks.form.edit}>
                <Button variant="outline" onClick={handleOpenEdit}>
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              </PermissionGuard>
            )}
            {checkRecordOwnership(archiveLevel, task.createdBy, user?.id) && (
              <PermissionGuard permission={Permissions.maintenance.serviceTasks.form.archive}>
                <Button variant="secondary" onClick={() => setArchiveDialogOpen(true)}>
                  <Archive className="h-4 w-4" />
                  Archive
                </Button>
              </PermissionGuard>
            )}
          </>
        }
      />

      {/* Details */}
      <DetailCard icon={ClipboardList} title="Details" columns={1}>
        <DetailField label="Title" value={task.title} />
        <DetailField label="Description" value={task.description} />
      </DetailCard>

      {/* Cost */}
      <DetailCard icon={DollarSign} title="Cost" columns={3} className="mt-6">
        <DetailField
          label="Labor Cost"
          value={task.laborCost != null ? `$${task.laborCost.toFixed(2)}` : undefined}
        />
        <DetailField
          label="Parts Cost"
          value={task.partsCost != null ? `$${task.partsCost.toFixed(2)}` : undefined}
        />
        <DetailField
          label="Total Cost"
          value={task.totalCost != null ? `$${task.totalCost.toFixed(2)}` : undefined}
        />
      </DetailCard>

      {/* Overlay backdrop */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={handleClosePanel}
        />
      )}

      {/* Right Panel -- Service Task Form (slide-out) */}
      <div
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-[460px] border-l border-border bg-background transition-transform duration-300',
          panelOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {panelOpen && (
          <ServiceTaskForm
            mode="edit"
            task={task}
            onClose={handleClosePanel}
            onSaved={handleSaved}
          />
        )}
      </div>

      {/* Archive dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={task.title}
        action="archive"
        onConfirm={handleArchive}
        loading={archiving}
      />
    </div>
  );
}
