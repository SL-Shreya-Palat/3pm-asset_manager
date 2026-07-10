'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Edit,
  Archive,
  Store,
  User,
  DollarSign,
  Settings,
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
import { useConnection } from '@/hooks/use-connection';
import { VendorForm } from './vendor-form';
import type { VendorRow } from './types';
import { vendorTypeLabel, vendorWebsiteHref } from './types';

export function VendorDetail() {
  const params = useParams();
  const router = useRouter();
  const { connected } = useConnection();
  const [vendor, setVendor] = useState<VendorRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit panel
  const [editPanelOpen, setEditPanelOpen] = useState(false);

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const fetchVendor = useCallback(async () => {
    try {
      const res = await axios.get(`/api/vendors/${params.id}`, { withCredentials: true });
      setVendor(res.data.data);
    } catch {
      setVendor(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) fetchVendor();
  }, [params.id, fetchVendor]);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await axios.patch(`/api/vendors/${params.id}/archive`, { archived: true }, { withCredentials: true });
      router.push('/vendors');
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
  if (!vendor) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Vendor not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/vendors')}>
          Back to Vendors
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <DetailPageHeader
        backHref="/vendors"
        backLabel="Back to Vendors"
        icon={Store}
        title={vendor.name}
        badges={
          <>
            {vendor.vendorTypes.map((t) => (
              <Badge key={t} variant="secondary" className="capitalize">{vendorTypeLabel(t)}</Badge>
            ))}
          </>
        }
        actions={
          // Command-sourced suppliers are master data while connected —
          // edited/archived in Command (matches the vendors list page).
          connected && vendor.source === 'command' ? undefined : (
            <>
              <Button variant="outline" onClick={() => setEditPanelOpen(true)}>
                <Edit className="h-4 w-4" />
                Edit
              </Button>
              <Button variant="archive-ghost" onClick={() => setArchiveDialogOpen(true)}>
                <Archive className="h-4 w-4" />
                Archive
              </Button>
            </>
          )
        }
      />

      {/* Vendor Details */}
      <DetailCard icon={Store} title="Vendor Details" columns={3}>
        <DetailField label="Vendor Name" value={vendor.name} />
        <DetailField label="Address" value={vendor.address} />
        <DetailField
          label="Website"
          value={
            vendor.website ? (
              <a
                href={vendorWebsiteHref(vendor.website)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {vendor.website}
              </a>
            ) : undefined
          }
        />
      </DetailCard>

      {/* Primary Contact */}
      <DetailCard icon={User} title="Primary Contact" columns={3} className="mt-6">
        <DetailField label="Contact Name" value={vendor.contactName} />
        <DetailField label="Phone" value={vendor.phone} />
        <DetailField label="Email" value={vendor.email} />
      </DetailCard>

      {/* Vendor Type & Access */}
      <DetailCard icon={Settings} title="Vendor Type" columns={1} className="mt-6">
        <DetailField
          label="Vendor Type"
          value={vendor.vendorTypes.length > 0 ? vendor.vendorTypes.map(vendorTypeLabel).join(', ') : undefined}
        />
      </DetailCard>

      {/* Labor Rate */}
      <DetailCard icon={DollarSign} title="Labor Rate" columns={1} className="mt-6">
        <DetailField
          label="Rate per hour"
          value={vendor.laborRatePerHour != null ? `$${vendor.laborRatePerHour.toFixed(2)}` : undefined}
        />
      </DetailCard>

      {/* Edit panel */}
      {editPanelOpen && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setEditPanelOpen(false)} />
      )}
      <div
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-[460px] border-l border-border bg-background transition-transform duration-300',
          editPanelOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {editPanelOpen && (
          <VendorForm
            mode="edit"
            vendor={vendor}
            onClose={() => setEditPanelOpen(false)}
            onSaved={() => {
              setEditPanelOpen(false);
              fetchVendor();
            }}
          />
        )}
      </div>

      {/* Archive dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={vendor.name}
        action="archive"
        onConfirm={handleArchive}
        loading={archiving}
      />
    </div>
  );
}
