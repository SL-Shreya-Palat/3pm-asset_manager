'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { X, Plus, Trash2, SquarePen, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PartRow, LookupOption } from './types';

interface PartFormProps {
  mode: 'create' | 'edit';
  part?: PartRow | null;
  onClose: () => void;
  onSaved: () => void;
}

interface VendorLineState {
  vendorId: string;
  unitCost: string;
}

interface LocationLineState {
  locationId: string;
  quantity: string;
}

export function PartForm({ mode, part, onClose, onSaved }: PartFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields
  const [name, setName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [upc, setUpc] = useState('');
  const [description, setDescription] = useState('');
  const [manufacturerId, setManufacturerId] = useState('');
  const [reorderPoint, setReorderPoint] = useState('');
  const [maximumQuantity, setMaximumQuantity] = useState('');
  const [measurementUnitId, setMeasurementUnitId] = useState('');
  const [categoryId, setCategoryId] = useState('');

  // Photo upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Multi-vendor rows
  const [vendorLines, setVendorLines] = useState<VendorLineState[]>([]);
  // Multi-location rows
  const [locationLines, setLocationLines] = useState<LocationLineState[]>([]);

  // Lookup data from settings
  const [manufacturers, setManufacturers] = useState<LookupOption[]>([]);
  const [measurementUnits, setMeasurementUnits] = useState<LookupOption[]>([]);
  const [categories, setCategories] = useState<LookupOption[]>([]);
  const [locations, setLocations] = useState<LookupOption[]>([]);
  const [vendors, setVendors] = useState<LookupOption[]>([]);

  // Fetch lookup data
  const fetchLookups = useCallback(async () => {
    try {
      const [mfRes, muRes, catRes, locRes, venRes] = await Promise.all([
        axios.get('/api/inventory-settings/part-manufacturers', { withCredentials: true }),
        axios.get('/api/inventory-settings/measurement-units', { withCredentials: true }),
        axios.get('/api/inventory-settings/part-categories', { withCredentials: true }),
        axios.get('/api/inventory-settings/part-locations', { withCredentials: true }),
        axios.get('/api/vendors?limit=100', { withCredentials: true }),
      ]);
      setManufacturers((mfRes.data.data || []).map((i: Record<string, unknown>) => ({ id: i.id as string, name: i.name as string })));
      setMeasurementUnits((muRes.data.data || []).map((i: Record<string, unknown>) => ({
        id: i.id as string,
        name: i.name as string,
        symbol: i.symbol as string,
      })));
      setCategories((catRes.data.data || []).map((i: Record<string, unknown>) => ({ id: i.id as string, name: i.name as string })));
      setLocations((locRes.data.data || []).map((i: Record<string, unknown>) => ({ id: i.id as string, name: i.name as string })));
      const vendorItems = venRes.data.data?.items || venRes.data.data || [];
      setVendors(vendorItems.map((i: Record<string, unknown>) => ({ id: i.id as string, name: i.name as string })));
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5 MB');
      return;
    }

    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Populate form (edit mode)
  useEffect(() => {
    if (part && mode === 'edit') {
      setName(part.name || '');
      setPartNumber(part.partNumber || '');
      setUpc(part.upc || '');
      setDescription(part.description || '');
      setManufacturerId(part.manufacturerId || '');
      setReorderPoint(part.reorderPoint != null ? String(part.reorderPoint) : '');
      setMaximumQuantity(part.maximumQuantity != null ? String(part.maximumQuantity) : '');
      setMeasurementUnitId(part.measurementUnitId || '');
      setCategoryId(part.categoryId || '');
      setVendorLines(
        (part.vendors || []).map((v) => ({ vendorId: v.vendorId, unitCost: String(v.unitCost) })),
      );
      setLocationLines(
        (part.stockLocations || []).map((s) => ({ locationId: s.locationId, quantity: String(s.quantity) })),
      );
      if (part.photoUrl) {
        setPhotoPreview(part.photoUrl);
      }
    }
  }, [part, mode]);

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  // Vendor line helpers
  const addVendorLine = () => setVendorLines((prev) => [...prev, { vendorId: '', unitCost: '' }]);
  const removeVendorLine = (idx: number) => setVendorLines((prev) => prev.filter((_, i) => i !== idx));
  const updateVendorLine = (idx: number, field: keyof VendorLineState, value: string) => {
    setVendorLines((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  // Location line helpers
  const addLocationLine = () => setLocationLines((prev) => [...prev, { locationId: '', quantity: '' }]);
  const removeLocationLine = (idx: number) => setLocationLines((prev) => prev.filter((_, i) => i !== idx));
  const updateLocationLine = (idx: number, field: keyof LocationLineState, value: string) => {
    setLocationLines((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Part name is required';
    if (!partNumber.trim()) errors.partNumber = 'Part number is required';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    // Handle photo upload
    let photoUrl: string | undefined;
    if (photoFile) {
      try {
        const formData = new FormData();
        formData.append('file', photoFile);
        const uploadRes = await axios.post('/api/upload', formData, {
          withCredentials: true,
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (uploadRes.data?.data?.url) {
          photoUrl = uploadRes.data.data.url;
        }
      } catch {
        // Continue without photo
      }
    } else if (photoPreview && !photoFile) {
      // Keep existing photo URL in edit mode
      photoUrl = photoPreview;
    }

    const payload = {
      name: name.trim(),
      partNumber: partNumber.trim(),
      upc: upc.trim() || undefined,
      description: description.trim() || undefined,
      photoUrl: photoUrl || undefined,
      manufacturerId: manufacturerId || undefined,
      measurementUnitId: measurementUnitId || undefined,
      categoryId: categoryId || undefined,
      reorderPoint: reorderPoint ? parseFloat(reorderPoint) : undefined,
      maximumQuantity: maximumQuantity ? parseFloat(maximumQuantity) : undefined,
      vendors: vendorLines
        .filter((v) => v.vendorId)
        .map((v) => ({ vendorId: v.vendorId, unitCost: v.unitCost ? parseFloat(v.unitCost) : 0 })),
      stockLocations: locationLines
        .filter((l) => l.locationId)
        .map((l) => ({ locationId: l.locationId, quantity: l.quantity ? parseInt(l.quantity, 10) : 0 })),
    };

    try {
      setSaving(true);
      if (mode === 'edit' && part) {
        await axios.put(`/api/parts/${part.id}`, payload, { withCredentials: true });
      } else {
        await axios.post('/api/parts', payload, { withCredentials: true });
      }
      onSaved();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const errData = err.response.data.error;
        if (typeof errData === 'object') setFieldErrors(errData as Record<string, string>);
        else setError(String(errData));
      } else {
        setError('Failed to save part');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">
          {mode === 'edit' ? 'Edit Part' : 'Add Part'}
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Form body */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">

          {/* ── Part Photo ── */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="relative h-24 w-24 cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Part photo"
                  className="h-24 w-24 rounded-full object-cover border-2 border-border"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-border bg-muted/50">
                  <Package className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm group-hover:bg-primary/90 transition-colors">
                <SquarePen className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Click to upload part photo</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>

          {/* ── Part Details ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Part Details</h3>
            <Separator className="mb-4" />
            <div className="space-y-4">
              {/* Part Name */}
              <div>
                <Label htmlFor="partName">Part name <span className="text-destructive">*</span></Label>
                <Input
                  id="partName"
                  value={name}
                  onChange={(e) => { setName(e.target.value); clearFieldError('name'); }}
                  placeholder="Enter part name"
                  className={`mt-1.5 ${fieldErrors.name ? 'border-destructive' : ''}`}
                />
                {fieldErrors.name && <p className="text-sm text-destructive mt-1">{fieldErrors.name}</p>}
              </div>

              {/* Part Number */}
              <div>
                <Label htmlFor="partNumber">Part number <span className="text-destructive">*</span></Label>
                <Input
                  id="partNumber"
                  value={partNumber}
                  onChange={(e) => { setPartNumber(e.target.value); clearFieldError('partNumber'); }}
                  placeholder="Enter part number"
                  className={`mt-1.5 ${fieldErrors.partNumber ? 'border-destructive' : ''}`}
                />
                <p className="text-xs text-muted-foreground mt-1">Must be unique per part</p>
                {fieldErrors.partNumber && <p className="text-sm text-destructive mt-1">{fieldErrors.partNumber}</p>}
              </div>

              {/* UPC */}
              <div>
                <Label htmlFor="upc">UPC</Label>
                <Input
                  id="upc"
                  value={upc}
                  onChange={(e) => { setUpc(e.target.value); clearFieldError('upc'); }}
                  placeholder="e.g. 012345678901"
                  maxLength={12}
                  className={`mt-1.5 ${fieldErrors.upc ? 'border-destructive' : ''}`}
                />
                <p className="text-xs text-muted-foreground mt-1">Twelve digit unique number associated with the bar code</p>
                {fieldErrors.upc && <p className="text-sm text-destructive mt-1">{fieldErrors.upc}</p>}
              </div>

              {/* Manufacturer */}
              <div>
                <Label>Manufacturer</Label>
                <Select value={manufacturerId} onValueChange={setManufacturerId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select manufacturer" />
                  </SelectTrigger>
                  <SelectContent>
                    {manufacturers.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No data yet</div>
                    ) : (
                      manufacturers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Can&apos;t find the manufacturer? You can add it in{' '}
                  <button
                    type="button"
                    onClick={() => router.push('/settings?section=part-manufacturers')}
                    className="text-primary hover:underline font-medium"
                  >
                    Settings &gt; Admin Settings &gt; Inventory
                  </button>
                </p>
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="partDescription">Description</Label>
                <Textarea
                  id="partDescription"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the part..."
                  rows={3}
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>

          {/* ── Stock Management ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Stock Management</h3>
            <Separator className="mb-4" />
            <div className="space-y-4">
              {/* Reorder Point */}
              <div>
                <Label htmlFor="reorderPoint">Reorder point</Label>
                <Input
                  id="reorderPoint"
                  type="number"
                  min="0"
                  value={reorderPoint}
                  onChange={(e) => setReorderPoint(e.target.value)}
                  placeholder="0"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  When the stock reaches the reorder point, a notification will be sent
                </p>
              </div>

              {/* Maximum Quantity */}
              <div>
                <Label htmlFor="maxQty">Maximum quantity limit</Label>
                <Input
                  id="maxQty"
                  type="number"
                  min="0"
                  value={maximumQuantity}
                  onChange={(e) => setMaximumQuantity(e.target.value)}
                  placeholder="0"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Depending on the size of the product we can set a maximum order limit
                </p>
              </div>

              {/* Measurement Unit */}
              <div>
                <Label>Measurement unit</Label>
                <Select value={measurementUnitId} onValueChange={setMeasurementUnitId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {measurementUnits.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No data yet</div>
                    ) : (
                      measurementUnits.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}{u.symbol ? ` (${u.symbol})` : ''}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Can&apos;t find the measurement unit? You can add it in{' '}
                  <button
                    type="button"
                    onClick={() => router.push('/settings?section=measurement-units')}
                    className="text-primary hover:underline font-medium"
                  >
                    the settings
                  </button>
                </p>
              </div>

              {/* Category */}
              <div>
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No data yet</div>
                    ) : (
                      categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Can&apos;t find the category? You can add it in{' '}
                  <button
                    type="button"
                    onClick={() => router.push('/settings?section=part-categories')}
                    className="text-primary hover:underline font-medium"
                  >
                    the settings
                  </button>
                </p>
              </div>
            </div>
          </div>

          {/* ── Vendors ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Vendors</h3>
              <Button type="button" variant="outline" size="sm" onClick={addVendorLine}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Vendor
              </Button>
            </div>
            <Separator className="mb-4" />

            {vendorLines.length === 0 && (
              <p className="text-sm text-muted-foreground">No vendors added. Click &quot;Add Vendor&quot; to link a vendor with unit cost.</p>
            )}

            <div className="space-y-3">
              {vendorLines.map((line, idx) => (
                <div key={idx} className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label className="text-xs">Vendor</Label>
                    <Select value={line.vendorId} onValueChange={(val) => updateVendorLine(idx, 'vendorId', val)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendors.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No data yet</div>
                        ) : (
                          vendors.map((v) => (
                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[120px]">
                    <Label className="text-xs">Unit Cost ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.unitCost}
                      onChange={(e) => updateVendorLine(idx, 'unitCost', e.target.value)}
                      placeholder="0.00"
                      className="mt-1"
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeVendorLine(idx)} className="text-destructive hover:text-destructive mb-0.5">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Locations ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Locations</h3>
              <Button type="button" variant="outline" size="sm" onClick={addLocationLine}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Location
              </Button>
            </div>
            <Separator className="mb-4" />

            {locationLines.length === 0 && (
              <p className="text-sm text-muted-foreground">No locations added. Click &quot;Add Location&quot; to set stock quantities per location.</p>
            )}

            <div className="space-y-3">
              {locationLines.map((line, idx) => (
                <div key={idx} className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label className="text-xs">Location</Label>
                    <Select value={line.locationId} onValueChange={(val) => updateLocationLine(idx, 'locationId', val)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No data yet</div>
                        ) : (
                          locations.map((l) => (
                            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[120px]">
                    <Label className="text-xs">Quantity</Label>
                    <Input
                      type="number"
                      min="0"
                      value={line.quantity}
                      onChange={(e) => updateLocationLine(idx, 'quantity', e.target.value)}
                      placeholder="0"
                      className="mt-1"
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeLocationLine(idx)} className="text-destructive hover:text-destructive mb-0.5">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>
      </form>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving...' : mode === 'edit' ? 'Update Part' : 'Create Part'}
        </Button>
      </div>
    </div>
  );
}
