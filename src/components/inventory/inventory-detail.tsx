'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Edit,
  Archive,
  Package,
  BarChart3,
  Store,
  MapPin,
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
import { PartForm } from './part-form';
import type { PartRow, LookupOption } from './types';

function getTotalStock(part: PartRow): number {
  return (part.stockLocations || []).reduce((sum, s) => sum + s.quantity, 0);
}

function getStockStatus(part: PartRow, total: number): { label: string; variant: 'success' | 'warning' | 'destructive' } {
  if (total <= 0) return { label: 'Out of stock', variant: 'destructive' };
  if (part.reorderPoint != null && total <= part.reorderPoint) return { label: 'Low stock', variant: 'warning' };
  return { label: 'In stock', variant: 'success' };
}

export function InventoryDetail() {
  const params = useParams();
  const router = useRouter();
  const [part, setPart] = useState<PartRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Lookups
  const [vendors, setVendors] = useState<LookupOption[]>([]);
  const [categories, setCategories] = useState<LookupOption[]>([]);
  const [units, setUnits] = useState<LookupOption[]>([]);
  const [locations, setLocations] = useState<LookupOption[]>([]);

  // Edit panel
  const [editPanelOpen, setEditPanelOpen] = useState(false);

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const fetchPart = useCallback(async () => {
    try {
      const res = await axios.get(`/api/parts/${params.id}`, { withCredentials: true });
      setPart(res.data.data);
    } catch {
      setPart(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  const fetchLookups = useCallback(async () => {
    try {
      const [vendorRes, categoryRes, unitRes, locationRes] = await Promise.all([
        axios.get('/api/vendors?limit=100', { withCredentials: true }),
        axios.get('/api/parts/categories', { withCredentials: true }),
        axios.get('/api/parts/units', { withCredentials: true }),
        axios.get('/api/parts/locations', { withCredentials: true }),
      ]);
      setVendors(vendorRes.data.data || []);
      setCategories(categoryRes.data.data || []);
      setUnits(unitRes.data.data || []);
      setLocations(locationRes.data.data || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (params.id) {
      fetchPart();
      fetchLookups();
    }
  }, [params.id, fetchPart, fetchLookups]);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await axios.patch(`/api/parts/${params.id}/archive`, { archived: true }, { withCredentials: true });
      router.push('/maintenance/inventory');
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
  if (!part) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Part not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/maintenance/inventory')}>
          Back to Inventory
        </Button>
      </div>
    );
  }

  const totalStock = getTotalStock(part);
  const stockStatus = getStockStatus(part, totalStock);
  const categoryName = part.categoryId ? categories.find((c) => c.id === part.categoryId)?.name : undefined;
  const unitName = part.measurementUnitId ? units.find((u) => u.id === part.measurementUnitId)?.name : undefined;
  const unitPrice = part.vendors.find((v) => v.unitCost > 0)?.unitCost;
  const stockValue = unitPrice != null ? totalStock * unitPrice : undefined;

  return (
    <div className="p-6 max-w-4xl">
      <DetailPageHeader
        backHref="/maintenance/inventory"
        backLabel="Back to Inventory"
        icon={Package}
        title={part.name}
        badges={
          <Badge variant={stockStatus.variant}>{stockStatus.label}</Badge>
        }
        subtitle={`#${part.partNumber}`}
        actions={
          <>
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

      <div className="space-y-6">
        {/* Part Details */}
        <DetailCard icon={Package} title="Part Details" columns={3}>
          <DetailField label="Name" value={part.name} />
          <DetailField label="Part Number" value={part.partNumber} />
          <DetailField label="UPC" value={part.upc} />
          <DetailField label="Category" value={categoryName} />
          <DetailField label="Description" value={part.description} className="col-span-full" />
        </DetailCard>

        {/* Stock Management */}
        <DetailCard icon={BarChart3} title="Stock Management" columns={3}>
          <DetailField label="Total Stock" value={totalStock} />
          <DetailField label="Reorder Point" value={part.reorderPoint} />
          <DetailField label="Max Quantity" value={part.maximumQuantity} />
          <DetailField label="Measurement Unit" value={unitName} />
          <DetailField label="Unit Price" value={unitPrice != null ? `$${unitPrice.toFixed(2)}` : undefined} />
          <DetailField label="Stock Value" value={stockValue != null ? `$${stockValue.toFixed(2)}` : undefined} />
        </DetailCard>

        {/* Vendors */}
        <DetailCard icon={Store} title="Vendors" columns={1}>
          {part.vendors.length > 0 ? (
            <div className="space-y-2">
              {part.vendors.map((v) => {
                const vendorName = vendors.find((vn) => vn.id === v.vendorId)?.name || v.vendorId;
                return (
                  <div
                    key={v.vendorId}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  >
                    <span className="text-sm font-medium text-foreground">{vendorName}</span>
                    <span className="text-sm text-muted-foreground">${v.unitCost.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No vendors assigned</p>
          )}
        </DetailCard>

        {/* Stock Locations */}
        <DetailCard icon={MapPin} title="Stock Locations" columns={1}>
          {part.stockLocations.length > 0 ? (
            <div className="space-y-2">
              {part.stockLocations.map((s, idx) => {
                const locationName = s.locationId
                  ? locations.find((l) => l.id === s.locationId)?.name || s.locationId
                  : 'Unassigned';
                return (
                  <div
                    key={s.locationId || `unassigned-${idx}`}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  >
                    <span className="text-sm font-medium text-foreground">{locationName}</span>
                    <span className="text-sm text-muted-foreground">{s.quantity}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No stock locations</p>
          )}
        </DetailCard>
      </div>

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
          <PartForm
            mode="edit"
            part={part}
            onClose={() => setEditPanelOpen(false)}
            onSaved={() => {
              setEditPanelOpen(false);
              fetchPart();
            }}
          />
        )}
      </div>

      {/* Archive dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={part.name}
        action="archive"
        onConfirm={handleArchive}
        loading={archiving}
      />
    </div>
  );
}
