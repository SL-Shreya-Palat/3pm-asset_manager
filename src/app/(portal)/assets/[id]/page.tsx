'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft, Pencil, Power, Fuel, Info, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ASSET_STATUS_CONFIG, type AssetStatus } from '@/constants/assets';
import { InspectButton } from '@/components/inspections/inspect-button';
import { AssetFuelTab } from '@/components/fuel/asset-fuel-tab';
import { AssetServiceTab } from '@/components/assets/asset-service-tab';

const ASSET_TABS = [
  { id: 'details', label: 'Details', icon: Info },
  { id: 'service', label: 'Service', icon: Wrench },
  { id: 'fuel', label: 'Fuel', icon: Fuel },
] as const;

type AssetTabId = (typeof ASSET_TABS)[number]['id'];

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [asset, setAsset] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [activeTab, setActiveTab] = useState<AssetTabId>('details');

  const fetchAsset = useCallback(async () => {
    try {
      const res = await axios.get(`/api/assets/${params.id}`, { withCredentials: true });
      setAsset(res.data.data);
    } catch {
      setAsset(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) fetchAsset();
  }, [params.id, fetchAsset]);

  const handleToggleStatus = async () => {
    if (!asset) return;
    const current = asset.status === 'active' || asset.status === 'in_service' ? 'in_service' : 'out_of_service';
    const newStatus = current === 'in_service' ? 'out_of_service' : 'in_service';
    try {
      setToggling(true);
      await axios.put(`/api/assets/${params.id}`, { status: newStatus }, { withCredentials: true });
      await fetchAsset();
    } catch {
      console.error('Failed to update status');
    } finally {
      setToggling(false);
    }
  };

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
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-16 mb-1.5" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <Skeleton className="h-5 w-32 mb-4" />
          <Separator className="mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
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

  if (!asset) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Asset not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/assets')}>
          Back to Assets
        </Button>
      </div>
    );
  }

  const normalizedStatus = asset.status === 'active' ? 'in_service' : String(asset.status);
  const statusConfig = ASSET_STATUS_CONFIG[(normalizedStatus as AssetStatus)] || {
    label: String(asset.status || ''),
    variant: 'outline' as const,
  };

  // Extract values for type safety in JSX
  const assetName = String(asset.name || '');
  const assetNum = String(asset.assetNumber || '');
  const assetNotes = String(asset.notes || '');

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/assets')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-foreground">{assetName}</h1>
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            </div>
            {assetNum && (
              <p className="text-sm text-muted-foreground mt-0.5">#{assetNum}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <InspectButton assetId={String(params.id)} />
          <Button
            variant={normalizedStatus === 'in_service' ? 'destructive' : 'default'}
            onClick={handleToggleStatus}
            disabled={toggling}
          >
            <Power className="h-4 w-4" />
            {toggling
              ? 'Updating...'
              : normalizedStatus === 'in_service'
                ? 'Mark as Out of Service'
                : 'Mark as In Service'}
          </Button>
          <Button onClick={() => router.push(`/assets/${params.id}/edit`)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border mb-6">
        <div className="flex gap-0">
          {ASSET_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'details' && (
        <>
          {/* Manufacturer Details */}
          <div className="rounded-lg border bg-card p-5 shadow-sm mb-6">
            <h2 className="text-base font-semibold mb-4">Manufacturer Details</h2>
            <Separator className="mb-4" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Detail label="VIN" value={String(asset.vin || '')} />
              <Detail label="License" value={String(asset.licensePlate || '')} />
              <Detail label="Make" value={String(asset.make || '')} />
              <Detail label="Model" value={String(asset.model || '')} />
              <Detail label="Year" value={asset.year ? String(asset.year) : ''} />
              <Detail label="Color" value={String(asset.color || '')} />
              <Detail label="Tire Size" value={String(asset.tireSize || '')} />
            </div>
            {assetNotes && (
              <div className="mt-4">
                <Detail label="Notes" value={assetNotes} />
              </div>
            )}
          </div>

          {/* Other Details */}
          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-4">Other Details</h2>
            <Separator className="mb-4" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Detail label="Mileage" value={asset.currentOdometer != null ? Number(asset.currentOdometer).toLocaleString() : ''} />
              <Detail
                label="Estimated Cost"
                value={
                  asset.estimatedCost != null
                    ? `${String(asset.currencyCode || 'USD')} ${Number(asset.estimatedCost).toLocaleString()}`
                    : ''
                }
              />
              <Detail label="Engine Hours" value={asset.currentEngineHours != null ? String(asset.currentEngineHours) : ''} />
              <Detail label="Asset Type" value={String(asset.assetTypeName || '')} />
              <Detail label="Asset Subtype" value={String(asset.assetSubtype || '')} />
              <Detail label="Subscription Type" value={String(asset.subscriptionType || '')} />
              <Detail label="Last Service Date" value={asset.lastServiceDate ? new Date(String(asset.lastServiceDate)).toLocaleDateString() : ''} />
              <Detail label="Last Service Mileage" value={asset.lastServiceMileage != null ? String(asset.lastServiceMileage) : ''} />
              <Detail label="Last Service Engine Hours" value={asset.lastServiceEngineHours != null ? String(asset.lastServiceEngineHours) : ''} />
            </div>
          </div>
        </>
      )}

      {activeTab === 'service' && (
        <AssetServiceTab assetId={String(params.id)} />
      )}

      {activeTab === 'fuel' && (
        <AssetFuelTab assetId={String(params.id)} />
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground mt-0.5">{value || '\u2014'}</p>
    </div>
  );
}
