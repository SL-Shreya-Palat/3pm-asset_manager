'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  ArrowLeft, Pencil, Power, Fuel, Info, Wrench,
  Truck, Gauge, Clock, DollarSign, Fingerprint, StickyNote, CalendarClock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { DetailCard, DetailField } from '@/components/ui/detail-field';
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
  const assetTypeName = String(asset.assetTypeName || '');
  const teamNames = Array.isArray(asset.teamNames) ? (asset.teamNames as string[]) : [];
  const currency = String(asset.currencyCode || 'USD');
  const odo = asset.currentOdometer != null ? Number(asset.currentOdometer) : null;
  const engineHours = asset.currentEngineHours != null ? Number(asset.currentEngineHours) : null;
  const estCost = asset.estimatedCost != null ? Number(asset.estimatedCost) : null;
  const lastServiceDate = asset.lastServiceDate ? new Date(String(asset.lastServiceDate)) : null;
  const createdAt = asset.createdAt ? new Date(String(asset.createdAt)) : null;

  return (
    <div className="p-6 max-w-4xl">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/assets')}
        className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Assets
      </Button>

      {/* Hero */}
      <div className="rounded-xl border bg-card p-5 shadow-sm mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Truck className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{assetName}</h1>
                <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                {assetNum && <span className="font-mono">#{assetNum}</span>}
                {assetNum && assetTypeName && <span>·</span>}
                {assetTypeName && <span>{assetTypeName}</span>}
              </div>
              {teamNames.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {teamNames.map((t) => (
                    <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
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
        <div className="space-y-6">
          {/* Key metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Mileage" value={odo != null ? odo.toLocaleString() : '—'} icon={<Gauge />} />
            <StatCard label="Engine Hours" value={engineHours != null ? engineHours.toLocaleString() : '—'} icon={<Clock />} />
            <StatCard label="Estimated Cost" value={estCost != null ? `${currency} ${estCost.toLocaleString()}` : '—'} icon={<DollarSign />} />
            <StatCard label="Last Service" value={lastServiceDate ? lastServiceDate.toLocaleDateString() : '—'} icon={<CalendarClock />} />
          </div>

          {/* Identification */}
          <DetailCard icon={Fingerprint} title="Identification">
            <DetailField label="Asset #" value={assetNum} />
            <DetailField label="VIN" value={String(asset.vin || '')} />
            <DetailField label="License Plate" value={String(asset.licensePlate || '')} />
            <DetailField label="Asset Type" value={assetTypeName} />
            <DetailField label="Asset Subtype" value={String(asset.assetSubtype || '')} />
            <DetailField label="Subscription Type" value={String(asset.subscriptionType || '')} />
            <DetailField label="Created" value={createdAt ? createdAt.toLocaleDateString() : ''} />
          </DetailCard>

          {/* Vehicle Specifications */}
          <DetailCard icon={Truck} title="Vehicle Specifications">
            <DetailField label="Make" value={String(asset.make || '')} />
            <DetailField label="Model" value={String(asset.model || '')} />
            <DetailField label="Year" value={asset.year ? String(asset.year) : ''} />
            <DetailField label="Color" value={String(asset.color || '')} />
            <DetailField label="Tire Size" value={String(asset.tireSize || '')} />
          </DetailCard>

          {/* Service History */}
          <DetailCard icon={Wrench} title="Service History">
            <DetailField label="Last Service Date" value={lastServiceDate ? lastServiceDate.toLocaleDateString() : ''} />
            <DetailField label="Last Service Mileage" value={asset.lastServiceMileage != null ? Number(asset.lastServiceMileage).toLocaleString() : ''} />
            <DetailField label="Last Service Engine Hours" value={asset.lastServiceEngineHours != null ? String(asset.lastServiceEngineHours) : ''} />
          </DetailCard>

          {/* Notes */}
          {assetNotes && (
            <DetailCard icon={StickyNote} title="Notes" columns={1}>
              <p className="text-sm text-foreground whitespace-pre-wrap">{assetNotes}</p>
            </DetailCard>
          )}
        </div>
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
