'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Edit,
  Archive,
  Wrench,
  Info,
  ClipboardList,
  Package,
  Users,
  Paperclip,
  History,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DetailCard, DetailField } from '@/components/ui/detail-field';
import {
  DetailPageHeader,
  DetailPageHeaderSkeleton,
} from '@/components/ui/detail-page-header';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { cn, formatDate } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { checkRecordOwnership } from '@/lib/rbac';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Permissions } from '@/consts/permissions';
import { WorkOrderForm } from './work-order-form';
import type { WorkOrderRow, WOStatusOption } from './types';

const WO_FORM_ID = 'maintenance.workOrders.workOrder';

export function WorkOrderDetail() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { hasFullAccess, permissionIndex } = useRoleAccess();
  const editLevel = hasFullAccess ? 'ALL' : permissionIndex.getEditLevel(WO_FORM_ID);
  const archiveLevel = hasFullAccess ? 'ALL' : permissionIndex.getArchiveLevel(WO_FORM_ID);
  const [order, setOrder] = useState<WorkOrderRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Lookup maps
  const [statusColorMap, setStatusColorMap] = useState<Record<string, string>>({});
  const [serviceTaskMap, setServiceTaskMap] = useState<Record<string, string>>({});

  // Edit panel
  const [editPanelOpen, setEditPanelOpen] = useState(false);

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Complete dialog placeholder
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await axios.get(`/api/work-orders/${params.id}`, { withCredentials: true });
      setOrder(res.data.data);
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  const fetchLookups = useCallback(async () => {
    try {
      const [statusesRes, tasksRes] = await Promise.all([
        axios.get('/api/work-order-statuses', { withCredentials: true }),
        axios.get('/api/service-tasks?limit=100', { withCredentials: true }),
      ]);

      // Build status color map
      const statuses: WOStatusOption[] = statusesRes.data.data || [];
      const colorMap: Record<string, string> = {};
      statuses.forEach((s) => {
        colorMap[s.id] = s.color;
      });
      setStatusColorMap(colorMap);

      // Build service task map
      const taskItems = tasksRes.data.data?.items || tasksRes.data.data || [];
      const taskMap: Record<string, string> = {};
      taskItems.forEach((t: Record<string, unknown>) => {
        taskMap[t.id as string] = (t.title as string) || (t.name as string) || '';
      });
      setServiceTaskMap(taskMap);
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    if (params.id) {
      fetchOrder();
      fetchLookups();
    }
  }, [params.id, fetchOrder, fetchLookups]);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await axios.patch(`/api/work-orders/${params.id}/archive`, { archived: true }, { withCredentials: true });
      router.push('/maintenance/work-orders');
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
  if (!order) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Work order not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/maintenance/work-orders')}>
          Back to Work Orders
        </Button>
      </div>
    );
  }

  const createdBy = order.createdBy ? String(order.createdBy) : null;
  const statusColor = statusColorMap[order.statusId] || '#6B7280';

  const assigneeTypeLabel = order.assigneeType === 'vendor'
    ? 'Vendor'
    : order.assigneeType === 'mechanic'
      ? 'Mechanic'
      : 'Third Party';

  return (
    <div className="p-6 max-w-4xl">
      <DetailPageHeader
        backHref="/maintenance/work-orders"
        backLabel="Back to Work Orders"
        icon={Wrench}
        title={order.workOrderNumber}
        badges={
          <>
            <Badge
              variant="outline"
              className="border"
              style={{
                backgroundColor: `${statusColor}20`,
                borderColor: statusColor,
                color: statusColor,
              }}
            >
              {order.statusLabel}
            </Badge>
            {order.isCompleted && (
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                <CheckCircle2 className="h-3 w-3" /> Completed
              </Badge>
            )}
          </>
        }
        subtitle={order.assetName}
        actions={
          <>
            {!order.isCompleted && (
              <Button onClick={() => setCompleteDialogOpen(true)}>
                <CheckCircle2 className="h-4 w-4" />
                Complete &amp; Sign Off
              </Button>
            )}
            {checkRecordOwnership(editLevel, createdBy, user?.id) && (
              <PermissionGuard permission={Permissions.maintenance.workOrders.form.edit}>
                <Button variant="outline" onClick={() => setEditPanelOpen(true)}>
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              </PermissionGuard>
            )}
            {checkRecordOwnership(archiveLevel, createdBy, user?.id) && (
              <PermissionGuard permission={Permissions.maintenance.workOrders.form.archive}>
                <Button variant="secondary" onClick={() => setArchiveDialogOpen(true)}>
                  <Archive className="h-4 w-4" />
                  Archive
                </Button>
              </PermissionGuard>
            )}
          </>
        }
      />

      {/* Detail Cards */}
      <div className="space-y-6">
        {/* Overview */}
        <DetailCard icon={Info} title="Overview">
          <DetailField label="WO Number" value={order.workOrderNumber} />
          <DetailField label="Status" value={
            <Badge
              variant="outline"
              className="border"
              style={{
                backgroundColor: `${statusColor}20`,
                borderColor: statusColor,
                color: statusColor,
              }}
            >
              {order.statusLabel}
            </Badge>
          } />
          <DetailField label="Asset" value={order.assetName} />
          <DetailField
            label="Due Date"
            value={order.dueDate ? formatDate(order.dueDate) : undefined}
          />
          <DetailField
            label="Created"
            value={new Date(order.createdAt).toLocaleString()}
          />
          {order.isCompleted && (
            <DetailField
              label="Completed"
              value={order.completedAt ? new Date(order.completedAt).toLocaleString() : 'Yes'}
            />
          )}
          {order.description && (
            <DetailField label="Description" value={order.description} className="col-span-full" />
          )}
        </DetailCard>

        {/* Service Tasks */}
        {order.serviceTaskIds.length > 0 && (
          <DetailCard icon={ClipboardList} title="Service Tasks" columns={1}>
            <div className="space-y-2">
              {order.serviceTaskIds.map((taskId, i) => (
                <div key={i} className="rounded-md border border-border px-3 py-2">
                  <span className="text-sm text-foreground">{serviceTaskMap[taskId] || taskId}</span>
                </div>
              ))}
            </div>
          </DetailCard>
        )}

        {/* Parts */}
        {order.parts && order.parts.length > 0 && (
          <DetailCard icon={Package} title="Parts" columns={1}>
            <div className="rounded-md border border-border divide-y divide-border">
              {order.parts.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-sm text-foreground">{p.partName}</span>
                    <span className="text-xs text-muted-foreground ml-2">&times;{p.quantity}</span>
                  </div>
                  <span className="text-sm text-foreground">{p.lineTotal.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                <span className="text-sm font-medium">Parts total</span>
                <span className="text-sm font-semibold">{(order.partsCost ?? 0).toFixed(2)}</span>
              </div>
            </div>
          </DetailCard>
        )}

        {/* Assignee */}
        <DetailCard icon={Users} title="Assignee" columns={2}>
          <DetailField label="Type" value={assigneeTypeLabel} />
          <DetailField label="Name" value={order.assigneeName} />
          <DetailField label="Contact" value={order.assigneeContact || undefined} />
          <DetailField label="Email" value={order.assigneeEmail || undefined} />
          <DetailField label="Phone" value={order.assigneePhone || undefined} />
          {order.thirdPartyName && (
            <DetailField label="Third Party Name" value={order.thirdPartyName} />
          )}
          {order.thirdPartyEmail && (
            <DetailField label="Third Party Email" value={order.thirdPartyEmail} />
          )}
        </DetailCard>

        {/* Attachments */}
        {order.attachments && order.attachments.length > 0 && (
          <DetailCard icon={Paperclip} title="Attachments" columns={1}>
            <div className="space-y-2">
              {order.attachments.map((att, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="text-sm text-foreground">{att.originalName}</span>
                  <span className="text-xs text-muted-foreground">
                    {att.size < 1024 * 1024
                      ? `${(att.size / 1024).toFixed(1)} KB`
                      : `${(att.size / (1024 * 1024)).toFixed(1)} MB`}
                  </span>
                </div>
              ))}
            </div>
          </DetailCard>
        )}

        {/* Status History */}
        {order.statusHistory && order.statusHistory.length > 0 && (
          <DetailCard icon={History} title="Status History" columns={1}>
            <div className="space-y-2">
              {order.statusHistory.map((entry, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                    {new Date(entry.changedAt).toLocaleString()}
                  </span>
                  <div>
                    <span className="text-foreground">
                      {entry.fromStatusLabel ? `${entry.fromStatusLabel} → ` : ''}
                      {entry.toStatusLabel}
                    </span>
                    {entry.changedBy && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        by {entry.changedBy}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </DetailCard>
        )}
      </div>

      {/* Edit Panel backdrop */}
      {editPanelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={() => setEditPanelOpen(false)}
        />
      )}

      {/* Edit Panel */}
      <div className={cn(
        'fixed top-0 right-0 z-50 h-full w-[560px] border-l border-border bg-background transition-transform duration-300',
        editPanelOpen ? 'translate-x-0' : 'translate-x-full',
      )}>
        {editPanelOpen && (
          <WorkOrderForm
            mode="edit"
            workOrder={order}
            onClose={() => setEditPanelOpen(false)}
            onSaved={() => {
              setEditPanelOpen(false);
              fetchOrder();
            }}
          />
        )}
      </div>

      {/* Archive Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={order.workOrderNumber}
        action="archive"
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Complete & Sign Off Placeholder Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete &amp; Sign Off</DialogTitle>
            <DialogDescription>
              Coming soon - use the list page for now.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
