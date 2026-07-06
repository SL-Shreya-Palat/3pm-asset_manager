'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Edit,
  Archive,
  ShoppingCart,
  Info,
  DollarSign,
  Paperclip,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DetailCard, DetailField } from '@/components/ui/detail-field';
import {
  DetailPageHeader,
  DetailPageHeaderSkeleton,
} from '@/components/ui/detail-page-header';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { cn } from '@/lib/utils';
import { PurchaseOrderForm } from './purchase-order-form';
import type { PurchaseOrderRow } from './types';
import {
  STATUS_BADGE_VARIANT,
  STATUS_DISPLAY_NAME,
} from './types';

export function PurchaseOrderDetail() {
  const params = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<PurchaseOrderRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit panel
  const [editPanelOpen, setEditPanelOpen] = useState(false);

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await axios.get(`/api/purchase-orders/${params.id}`, { withCredentials: true });
      setOrder(res.data.data);
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) fetchOrder();
  }, [params.id, fetchOrder]);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await axios.patch(`/api/purchase-orders/${params.id}/archive`, { archived: true }, { withCredentials: true });
      router.push('/maintenance/purchase-orders');
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
        <p className="text-muted-foreground">Purchase order not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/maintenance/purchase-orders')}>
          Back to Purchase Orders
        </Button>
      </div>
    );
  }

  const canEdit = order.status === 'draft';
  const canArchive = order.status === 'draft';

  // Compute tax amount for display
  const taxAmount = order.taxType === 'percentage'
    ? order.subTotal * (order.taxValue / 100)
    : order.taxValue;

  return (
    <div className="p-6 max-w-4xl">
      <DetailPageHeader
        backHref="/maintenance/purchase-orders"
        backLabel="Back to Purchase Orders"
        icon={ShoppingCart}
        title={order.poNumber}
        badges={
          <Badge variant={STATUS_BADGE_VARIANT[order.status] || 'secondary'}>
            {STATUS_DISPLAY_NAME[order.status] || order.status}
          </Badge>
        }
        subtitle={order.vendorName || undefined}
        actions={
          <>
            {canEdit && (
              <Button variant="outline" onClick={() => setEditPanelOpen(true)}>
                <Edit className="h-4 w-4" />
                Edit
              </Button>
            )}
            {canArchive && (
              <Button variant="secondary" onClick={() => setArchiveDialogOpen(true)}>
                <Archive className="h-4 w-4" />
                Archive
              </Button>
            )}
          </>
        }
      />

      {/* Detail Cards */}
      <div className="space-y-6">
        {/* Overview */}
        <DetailCard icon={Info} title="Overview" columns={4}>
          <DetailField label="PO Number" value={order.poNumber} />
          <DetailField label="Status" value={
            <Badge variant={STATUS_BADGE_VARIANT[order.status] || 'secondary'}>
              {STATUS_DISPLAY_NAME[order.status] || order.status}
            </Badge>
          } />
          <DetailField label="Vendor" value={order.vendorName || undefined} />
          <DetailField label="Delivery Location" value={order.deliveryLocationId} />
          <DetailField label="Approver" value={order.approverId} />
          <DetailField
            label="Created"
            value={order.createdAt ? new Date(order.createdAt).toLocaleDateString() : undefined}
          />
        </DetailCard>

        {/* Description */}
        {order.description && (
          <DetailCard icon={Info} title="Description" columns={1}>
            <p className="text-sm text-foreground col-span-full">{order.description}</p>
          </DetailCard>
        )}

        {/* Line Items */}
        {order.lineItems.length > 0 && (
          <DetailCard icon={ShoppingCart} title="Line Items" columns={1}>
            <div className="col-span-full space-y-2">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <span>Part</span>
                <span className="w-16 text-right">Qty</span>
                <span className="w-24 text-right">Unit Cost</span>
                <span className="w-24 text-right">Total</span>
              </div>
              {/* Line items */}
              {order.lineItems.map((li, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center rounded-md border border-border px-3 py-2">
                  <span className="text-sm text-foreground truncate">{li.partId}</span>
                  <span className="w-16 text-right text-sm text-muted-foreground tabular-nums">{li.quantity}</span>
                  <span className="w-24 text-right text-sm text-muted-foreground tabular-nums">${li.unitCost.toFixed(2)}</span>
                  <span className="w-24 text-right text-sm text-foreground font-medium tabular-nums">${li.total.toFixed(2)}</span>
                </div>
              ))}
              {/* Summary row */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-3 py-2 border-t border-border">
                <span className="text-sm font-semibold text-foreground">
                  {order.lineItems.length} item{order.lineItems.length !== 1 ? 's' : ''}
                </span>
                <span className="w-16 text-right text-sm font-semibold text-foreground tabular-nums">
                  {order.lineItems.reduce((sum, li) => sum + li.quantity, 0)}
                </span>
                <span className="w-24" />
                <span className="w-24 text-right text-sm font-semibold text-foreground tabular-nums">
                  ${order.subTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </DetailCard>
        )}

        {/* Cost Summary */}
        <DetailCard icon={DollarSign} title="Cost Summary" columns={3}>
          <DetailField label="Subtotal" value={`$${order.subTotal.toFixed(2)}`} />
          <DetailField label="Shipping" value={`$${order.shipping.toFixed(2)}`} />
          <DetailField
            label={`Tax (${order.taxType === 'percentage' ? `${order.taxValue}%` : `$${order.taxValue.toFixed(2)}`})`}
            value={`$${taxAmount.toFixed(2)}`}
          />
          <DetailField label="Grand Total" value={
            <span className="text-base font-semibold">${order.total.toFixed(2)}</span>
          } />
        </DetailCard>

        {/* Documents */}
        {order.documents.length > 0 && (
          <DetailCard icon={Paperclip} title="Documents" columns={1}>
            <div className="col-span-full space-y-2">
              {order.documents.map((doc, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="text-sm text-foreground">{doc.originalName}</span>
                  <span className="text-xs text-muted-foreground">
                    {doc.size < 1024 * 1024
                      ? `${(doc.size / 1024).toFixed(1)} KB`
                      : `${(doc.size / (1024 * 1024)).toFixed(1)} MB`}
                  </span>
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
          <PurchaseOrderForm
            mode="edit"
            purchaseOrder={order}
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
        itemName={order.poNumber}
        action="archive"
        onConfirm={handleArchive}
        loading={archiving}
      />
    </div>
  );
}
