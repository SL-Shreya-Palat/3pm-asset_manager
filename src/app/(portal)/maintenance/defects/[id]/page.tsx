'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  ArrowLeft,
  Pencil,
  Archive,
  Wrench,
  AlertTriangle,
  ClipboardCheck,
  Zap,
  PenLine,
  CalendarDays,
  Truck,
  MessageSquareText,
  Paperclip,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { DetailCard, DetailField } from '@/components/ui/detail-field';
import { cn, formatDate } from '@/lib/utils';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { DefectForm } from '@/components/defects/defect-form';
import { WorkOrderForm } from '@/components/work-orders/work-order-form';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { checkRecordOwnership } from '@/lib/rbac';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Permissions } from '@/consts/permissions';
import {
  STATUS_BADGE_VARIANT,
  STATUS_DISPLAY_NAME,
  SEVERITY_BADGE_CLASSES,
  SEVERITY_DISPLAY_NAME,
} from '@/components/defects/types';

const DEFECT_FORM_ID = 'maintenance.defects.defect';

/** Source display config. */
const SOURCE_CONFIG: Record<string, { label: string; icon: React.ReactNode; classes: string }> = {
  prestart_inspection: {
    label: 'Inspection',
    icon: <ClipboardCheck className="h-4 w-4" />,
    classes: 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
  },
  fault: {
    label: 'Fault',
    icon: <Zap className="h-4 w-4" />,
    classes: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
  },
  manual: {
    label: 'Manual',
    icon: <PenLine className="h-4 w-4" />,
    classes: 'bg-destructive/10 text-destructive',
  },
};

export default function DefectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { hasFullAccess, permissionIndex } = useRoleAccess();
  const editLevel = hasFullAccess ? 'ALL' : permissionIndex.getEditLevel(DEFECT_FORM_ID);
  const archiveLevel = hasFullAccess ? 'ALL' : permissionIndex.getArchiveLevel(DEFECT_FORM_ID);

  const [defect, setDefect] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit panel
  const [editPanelOpen, setEditPanelOpen] = useState(false);

  // Work-order panel
  const [woPanelOpen, setWoPanelOpen] = useState(false);

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const fetchDefect = useCallback(async () => {
    try {
      const res = await axios.get(`/api/defects/${params.id}`, { withCredentials: true });
      setDefect(res.data.data);
    } catch {
      setDefect(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) fetchDefect();
  }, [params.id, fetchDefect]);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await axios.patch(`/api/defects/${params.id}/archive`, { archived: true }, { withCredentials: true });
      router.push('/maintenance/defects');
    } catch {
      // silent
    } finally {
      setArchiving(false);
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="p-6 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-24 mt-1.5" />
          </div>
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-sm mb-6">
          <Skeleton className="h-5 w-40 mb-4" />
          <Separator className="mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-16 mb-1.5" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!defect) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Defect not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/maintenance/defects')}>
          Back to Defects
        </Button>
      </div>
    );
  }

  // Extract values
  const defectNumber = String(defect.defectNumber || '');
  const name = String(defect.name || '');
  const status = String(defect.status || 'new');
  const priority = String(defect.priority || '');
  const source = String(defect.source || 'manual');
  const date = defect.date ? new Date(String(defect.date)) : null;
  const comment = String(defect.comment || '');
  const assetName = String(defect.assetName || '');
  const driverName = defect.driverName ? String(defect.driverName) : null;
  const workOrderNumber = defect.workOrderNumber ? String(defect.workOrderNumber) : null;
  const createdAt = defect.createdAt ? new Date(String(defect.createdAt)) : null;
  const updatedAt = defect.updatedAt ? new Date(String(defect.updatedAt)) : null;
  const attachments = Array.isArray(defect.attachments) ? (defect.attachments as Array<Record<string, unknown>>) : [];
  const createdBy = defect.createdBy ? String(defect.createdBy) : null;

  const srcConfig = SOURCE_CONFIG[source] || SOURCE_CONFIG.manual;

  return (
    <div className="p-6 max-w-4xl">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/maintenance/defects')}
        className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Defects
      </Button>

      {/* Hero */}
      <div className="rounded-xl border bg-card p-5 shadow-sm mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl',
              srcConfig.classes,
            )}>
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{name}</h1>
                <Badge variant={STATUS_BADGE_VARIANT[status] || 'secondary'}>
                  {STATUS_DISPLAY_NAME[status] || status}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span className="font-mono">#{defectNumber}</span>
                <span>·</span>
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                  srcConfig.classes,
                )}>
                  {srcConfig.icon}
                  {srcConfig.label}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {!workOrderNumber && (
              <PermissionGuard permission={Permissions.maintenance.workOrders.form.create}>
                <Button onClick={() => setWoPanelOpen(true)}>
                  <Wrench className="h-4 w-4" />
                  Create Work Order
                </Button>
              </PermissionGuard>
            )}
            {checkRecordOwnership(editLevel, createdBy, user?.id) && (
              <PermissionGuard permission={Permissions.maintenance.defects.form.edit}>
                <Button variant="outline" onClick={() => setEditPanelOpen(true)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              </PermissionGuard>
            )}
            {checkRecordOwnership(archiveLevel, createdBy, user?.id) && (
              <PermissionGuard permission={Permissions.maintenance.defects.form.archive}>
                <Button variant="secondary" onClick={() => setArchiveDialogOpen(true)}>
                  <Archive className="h-4 w-4" />
                  Archive
                </Button>
              </PermissionGuard>
            )}
          </div>
        </div>
      </div>

      {/* Detail Cards */}
      <div className="space-y-6">
        {/* Overview */}
        <DetailCard icon={Info} title="Overview">
          <DetailField label="Defect Number" value={defectNumber} />
          <DetailField label="Status" value={
            <Badge variant={STATUS_BADGE_VARIANT[status] || 'secondary'}>
              {STATUS_DISPLAY_NAME[status] || status}
            </Badge>
          } />
          <DetailField label="Date" value={date ? formatDate(date) : ''} />
          <DetailField label="Severity" value={
            <span className={cn(
              'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
              SEVERITY_BADGE_CLASSES[priority] || 'bg-slate-100 text-slate-600',
            )}>
              {SEVERITY_DISPLAY_NAME[priority] || priority}
            </span>
          } />
        </DetailCard>

        {/* Asset & Driver */}
        <DetailCard icon={Truck} title="Asset & Driver" columns={2}>
          <DetailField label="Asset" value={assetName} />
          <DetailField label="Driver" value={driverName || ''} />
        </DetailCard>

        {/* Comment */}
        {comment && (
          <DetailCard icon={MessageSquareText} title="Comment" columns={1}>
            <p className="text-sm text-foreground whitespace-pre-wrap">{comment}</p>
          </DetailCard>
        )}

        {/* Work Order */}
        {workOrderNumber && (
          <DetailCard icon={Wrench} title="Linked Work Order" columns={2}>
            <DetailField label="Work Order Number" value={workOrderNumber} />
          </DetailCard>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <DetailCard icon={Paperclip} title="Attachments" columns={1}>
            <div className="space-y-2">
              {attachments.map((att, i) => {
                const size = Number(att.size || 0);
                return (
                  <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="text-sm text-foreground">{String(att.originalName || att.filename || '')}</span>
                    <span className="text-xs text-muted-foreground">
                      {size < 1024 * 1024
                        ? `${(size / 1024).toFixed(1)} KB`
                        : `${(size / (1024 * 1024)).toFixed(1)} MB`}
                    </span>
                  </div>
                );
              })}
            </div>
          </DetailCard>
        )}

        {/* Metadata */}
        <DetailCard icon={CalendarDays} title="Details" columns={2}>
          <DetailField label="Created" value={createdAt ? createdAt.toLocaleString() : ''} />
          <DetailField label="Last Updated" value={updatedAt ? updatedAt.toLocaleString() : ''} />
        </DetailCard>
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
          <DefectForm
            mode="edit"
            defect={{
              id: String(defect.id || params.id),
              defectNumber,
              name,
              date: defect.date ? String(defect.date) : '',
              comment,
              assetId: defect.assetId ? String(defect.assetId) : '',
              assetName,
              driverId: defect.driverId ? String(defect.driverId) : null,
              driverName,
              priority,
              severity: String(defect.severity || ''),
              status,
              workOrderId: defect.workOrderId ? String(defect.workOrderId) : null,
              workOrderNumber,
              source,
              attachments: attachments.map((a) => ({
                url: String(a.url || ''),
                filename: String(a.filename || ''),
                originalName: String(a.originalName || ''),
                contentType: String(a.contentType || ''),
                size: Number(a.size || 0),
                uploadedAt: String(a.uploadedAt || ''),
              })),
              createdAt: defect.createdAt ? String(defect.createdAt) : '',
              updatedAt: defect.updatedAt ? String(defect.updatedAt) : '',
              isArchived: Boolean(defect.isArchived),
              createdBy,
            }}
            onClose={() => setEditPanelOpen(false)}
            onSaved={() => {
              setEditPanelOpen(false);
              fetchDefect();
            }}
          />
        )}
      </div>

      {/* Work Order Panel backdrop */}
      {woPanelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={() => setWoPanelOpen(false)}
        />
      )}

      {/* Work Order Panel */}
      <div className={cn(
        'fixed top-0 right-0 z-50 h-full w-[560px] border-l border-border bg-background transition-transform duration-300',
        woPanelOpen ? 'translate-x-0' : 'translate-x-full',
      )}>
        {woPanelOpen && (
          <WorkOrderForm
            mode="create"
            source="defect"
            initialAssetId={defect.assetId ? String(defect.assetId) : undefined}
            initialDefectIds={[String(defect.id || params.id)]}
            lockAsset
            onClose={() => setWoPanelOpen(false)}
            onSaved={() => {
              setWoPanelOpen(false);
              fetchDefect();
            }}
          />
        )}
      </div>

      {/* Archive Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={defectNumber}
        action="archive"
        onConfirm={handleArchive}
        loading={archiving}
      />
    </div>
  );
}
