'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Edit,
  Archive,
  Wrench,
  AlertTriangle,
  Info,
  Truck,
  Tag,
  Gauge,
  Paperclip,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DetailCard, DetailField } from '@/components/ui/detail-field';
import {
  DetailPageHeader,
  DetailPageHeaderSkeleton,
} from '@/components/ui/detail-page-header';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { cn, formatDate } from '@/lib/utils';
import { FaultForm } from './fault-form';
import { WorkOrderForm } from '@/components/work-orders/work-order-form';
import type { FaultRow } from './types';
import {
  STATUS_BADGE_VARIANT,
  STATUS_DISPLAY_NAME,
  PRIORITY_BADGE_CLASSES,
  PRIORITY_DISPLAY_NAME,
  CATEGORY_DISPLAY_NAME,
} from './types';

export function FaultDetail() {
  const params = useParams();
  const router = useRouter();
  const [fault, setFault] = useState<FaultRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit panel
  const [editPanelOpen, setEditPanelOpen] = useState(false);

  // Work-order panel
  const [woPanelOpen, setWoPanelOpen] = useState(false);

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const fetchFault = useCallback(async () => {
    try {
      const res = await axios.get(`/api/faults/${params.id}`, { withCredentials: true });
      setFault(res.data.data);
    } catch {
      setFault(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) fetchFault();
  }, [params.id, fetchFault]);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await axios.patch(`/api/faults/${params.id}/archive`, { archived: true }, { withCredentials: true });
      router.push('/maintenance/faults');
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
  if (!fault) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Fault not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/maintenance/faults')}>
          Back to Faults
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <DetailPageHeader
        backHref="/maintenance/faults"
        backLabel="Back to Faults"
        icon={AlertTriangle}
        iconClassName="bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400"
        title={fault.title}
        badges={
          <>
            <Badge variant={STATUS_BADGE_VARIANT[fault.status] || 'secondary'}>
              {STATUS_DISPLAY_NAME[fault.status] || fault.status}
            </Badge>
            <span className={cn(
              'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
              PRIORITY_BADGE_CLASSES[fault.priority] || 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
            )}>
              {PRIORITY_DISPLAY_NAME[fault.priority] || fault.priority}
            </span>
          </>
        }
        subtitle={
          <span className="font-mono">#{fault.faultNumber}</span>
        }
        actions={
          <>
            {!fault.workOrderNumber && (
              <Button onClick={() => setWoPanelOpen(true)}>
                <Wrench className="h-4 w-4" />
                Create Work Order
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditPanelOpen(true)}>
              <Edit className="h-4 w-4" />
              Edit
            </Button>
            <Button variant="secondary" onClick={() => setArchiveDialogOpen(true)}>
              <Archive className="h-4 w-4" />
              Archive
            </Button>
          </>
        }
      />

      {/* Detail Cards */}
      <div className="space-y-6">
        {/* Overview */}
        <DetailCard icon={Info} title="Overview">
          <DetailField label="Fault Number" value={fault.faultNumber} />
          <DetailField label="Status" value={
            <Badge variant={STATUS_BADGE_VARIANT[fault.status] || 'secondary'}>
              {STATUS_DISPLAY_NAME[fault.status] || fault.status}
            </Badge>
          } />
          <DetailField
            label="Reported At"
            value={fault.reportedAt ? formatDate(fault.reportedAt) : undefined}
          />
          <DetailField label="Description" value={fault.description} className="col-span-full" />
          {fault.workOrderNumber && (
            <DetailField label="Work Order" value={fault.workOrderNumber} />
          )}
          {fault.takeOutOfService && (
            <div className="col-span-full">
              <p className="text-sm font-medium text-destructive">Asset taken out of service</p>
            </div>
          )}
        </DetailCard>

        {/* Asset & Reporter */}
        <DetailCard icon={Truck} title="Asset & Reporter" columns={3}>
          <DetailField label="Asset Name" value={fault.assetName} />
          <DetailField label="Reported By" value={fault.reportedByName || undefined} />
          <DetailField
            label="Reporter Type"
            value={fault.reportedByType === 'driver' ? 'Driver' : 'Team Member'}
          />
        </DetailCard>

        {/* Classification */}
        <DetailCard icon={Tag} title="Classification" columns={2}>
          <DetailField
            label="Category"
            value={CATEGORY_DISPLAY_NAME[fault.category] || fault.category}
          />
          <DetailField label="Severity" value={
            <span className={cn(
              'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
              PRIORITY_BADGE_CLASSES[fault.priority] || 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
            )}>
              {PRIORITY_DISPLAY_NAME[fault.priority] || fault.priority}
            </span>
          } />
        </DetailCard>

        {/* Meter — only show if meter data exists */}
        {(fault.meterType || fault.meterReading != null) && (
          <DetailCard icon={Gauge} title="Meter" columns={2}>
            <DetailField label="Meter Type" value={fault.meterType || undefined} />
            <DetailField
              label="Meter Reading"
              value={fault.meterReading != null ? String(fault.meterReading) : undefined}
            />
          </DetailCard>
        )}

        {/* Attachments — only show if attachments exist */}
        {fault.attachments && fault.attachments.length > 0 && (
          <DetailCard icon={Paperclip} title="Attachments" columns={1}>
            <div className="space-y-2">
              {fault.attachments.map((att, i) => (
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

        {/* Details */}
        <DetailCard icon={CalendarDays} title="Details" columns={2}>
          <DetailField
            label="Created At"
            value={fault.createdAt ? new Date(fault.createdAt).toLocaleString() : undefined}
          />
          <DetailField
            label="Updated At"
            value={fault.updatedAt ? new Date(fault.updatedAt).toLocaleString() : undefined}
          />
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
          <FaultForm
            mode="edit"
            fault={fault}
            onClose={() => setEditPanelOpen(false)}
            onSaved={() => {
              setEditPanelOpen(false);
              fetchFault();
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
            source="fault"
            initialAssetId={fault.assetId}
            initialFaultIds={[fault.id]}
            lockAsset
            onClose={() => setWoPanelOpen(false)}
            onSaved={() => {
              setWoPanelOpen(false);
              fetchFault();
            }}
          />
        )}
      </div>

      {/* Archive Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={fault.title}
        action="archive"
        onConfirm={handleArchive}
        loading={archiving}
      />
    </div>
  );
}
