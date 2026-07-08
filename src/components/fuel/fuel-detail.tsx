'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Edit,
  Archive,
  ArchiveRestore,
  Fuel,
  Info,
  DollarSign,
  Gauge,
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
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { checkRecordOwnership } from '@/lib/rbac';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Permissions } from '@/consts/permissions';
import { FuelForm } from './fuel-form';
import type { FuelTransactionRow } from './types';

function formatCurrency(value?: number) {
  if (value == null) return undefined;
  return `$${value.toFixed(2)}`;
}

function formatNumber(value?: number, decimals = 2) {
  if (value == null) return undefined;
  return value.toFixed(decimals);
}

const FUEL_FORM_ID = 'fuel.fuel.fuelEntry';

export function FuelDetail() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { hasFullAccess, permissionIndex } = useRoleAccess();
  const editLevel = hasFullAccess ? 'ALL' : permissionIndex.getEditLevel(FUEL_FORM_ID);
  const archiveLevel = hasFullAccess ? 'ALL' : permissionIndex.getArchiveLevel(FUEL_FORM_ID);

  const [transaction, setTransaction] = useState<FuelTransactionRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit panel
  const [editPanelOpen, setEditPanelOpen] = useState(false);

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const fetchTransaction = useCallback(async () => {
    try {
      const res = await axios.get(`/api/fuel/${params.id}`, { withCredentials: true });
      setTransaction(res.data.data);
    } catch {
      setTransaction(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) fetchTransaction();
  }, [params.id, fetchTransaction]);

  const handleArchive = async () => {
    if (!transaction) return;
    setArchiving(true);
    try {
      await axios.patch(`/api/fuel/${params.id}/archive`, {
        archived: !transaction.isArchived,
      }, { withCredentials: true });
      if (!transaction.isArchived) {
        router.push('/fuel');
      } else {
        fetchTransaction();
        setArchiveDialogOpen(false);
      }
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
  if (!transaction) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Fuel transaction not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/fuel')}>
          Back to Fuel
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <DetailPageHeader
        backHref="/fuel"
        backLabel="Back to Fuel"
        icon={Fuel}
        title={transaction.assetName || 'Fuel Transaction'}
        subtitle={formatDate(transaction.date)}
        badges={
          <>
            <Badge variant="secondary" className="capitalize">
              {transaction.fuelType}
            </Badge>
            {transaction.isArchived && (
              <Badge variant="outline" className="text-muted-foreground">
                Archived
              </Badge>
            )}
          </>
        }
        actions={
          <>
            {!transaction.isArchived && checkRecordOwnership(editLevel, transaction.createdBy, user?.id) && (
              <PermissionGuard permission={Permissions.fuel.fuel.form.edit}>
                <Button variant="outline" onClick={() => setEditPanelOpen(true)}>
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              </PermissionGuard>
            )}
            {checkRecordOwnership(archiveLevel, transaction.createdBy, user?.id) && (
              <PermissionGuard permission={Permissions.fuel.fuel.form.archive}>
                <Button variant="secondary" onClick={() => setArchiveDialogOpen(true)}>
                  {transaction.isArchived ? (
                    <ArchiveRestore className="h-4 w-4" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                  {transaction.isArchived ? 'Unarchive' : 'Archive'}
                </Button>
              </PermissionGuard>
            )}
          </>
        }
      />

      {/* Detail Cards */}
      <div className="space-y-6">
        {/* Transaction Info */}
        <DetailCard icon={Info} title="Transaction Info">
          <DetailField label="Date" value={formatDate(transaction.date)} />
          <DetailField label="Asset" value={transaction.assetName} />
          <DetailField label="Driver" value={transaction.driverName} />
          <DetailField label="Fuel Type" value={transaction.fuelType} />
          <DetailField label="Station" value={transaction.station} />
          <DetailField label="Source" value={transaction.source} />
          {transaction.notes && (
            <DetailField label="Notes" value={transaction.notes} className="col-span-full" />
          )}
        </DetailCard>

        {/* Cost & Volume */}
        <DetailCard icon={DollarSign} title="Cost & Volume" columns={3}>
          <DetailField label="Volume" value={formatNumber(transaction.volume) ? `${formatNumber(transaction.volume)} gal` : undefined} />
          <DetailField label="Unit Cost" value={formatCurrency(transaction.unitCost)} />
          <DetailField label="Total Cost" value={formatCurrency(transaction.totalCost)} />
        </DetailCard>

        {/* Odometer & Efficiency */}
        {(transaction.startMileage != null || transaction.endMileage != null || transaction.economy != null) && (
          <DetailCard icon={Gauge} title="Odometer & Efficiency" columns={3}>
            <DetailField
              label="Start Odometer (km)"
              value={transaction.startMileage != null ? formatNumber(transaction.startMileage, 0) : undefined}
            />
            <DetailField
              label="End Odometer (km)"
              value={transaction.endMileage != null ? formatNumber(transaction.endMileage, 0) : undefined}
            />
            <DetailField
              label="Distance"
              value={transaction.distance != null ? `${formatNumber(transaction.distance, 1)} km` : undefined}
            />
            <DetailField
              label="Fuel Economy"
              value={transaction.economy != null ? `${formatNumber(transaction.economy)} km/L` : undefined}
            />
            <DetailField label="Cost per km" value={formatCurrency(transaction.costPerMile)} />
          </DetailCard>
        )}

        {/* Timestamps */}
        <DetailCard icon={CalendarDays} title="Record Details" columns={2}>
          <DetailField
            label="Created At"
            value={transaction.createdAt ? new Date(transaction.createdAt).toLocaleString() : undefined}
          />
          <DetailField
            label="Updated At"
            value={transaction.updatedAt ? new Date(transaction.updatedAt).toLocaleString() : undefined}
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
        'fixed top-0 right-0 z-50 h-full w-[460px] border-l border-border bg-background transition-transform duration-300',
        editPanelOpen ? 'translate-x-0' : 'translate-x-full',
      )}>
        {editPanelOpen && (
          <FuelForm
            mode="edit"
            transaction={transaction}
            onClose={() => setEditPanelOpen(false)}
            onSaved={() => {
              setEditPanelOpen(false);
              fetchTransaction();
            }}
          />
        )}
      </div>

      {/* Archive Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={transaction.assetName || 'Fuel Transaction'}
        action={transaction.isArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />
    </div>
  );
}
