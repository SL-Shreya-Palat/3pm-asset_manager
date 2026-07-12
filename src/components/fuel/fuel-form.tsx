'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { Button, LoadingButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/ui/date-field';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { getTodayDateString } from '@/lib/utils';
import { showSuccessToast, showErrorToast } from '@/lib/toastUtils';
import type { FuelTransactionRow } from './types';

interface FuelFormProps {
  mode: 'create' | 'edit';
  transaction?: FuelTransactionRow | null;
  onClose: () => void;
  onSaved: () => void;
}

interface AssetOption {
  id: string;
  name: string;
  assetNumber?: string;
  make?: string;
  model?: string;
}

interface DriverOption {
  id: string;
  name: string;
}

export function FuelForm({ mode, transaction, onClose, onSaved }: FuelFormProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Lookup data
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);

  // Form fields
  const [assetId, setAssetId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [date, setDate] = useState(getTodayDateString());
  const [fuelType, setFuelType] = useState('diesel');
  const [volume, setVolume] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [startMileage, setStartMileage] = useState('');
  const [endMileage, setEndMileage] = useState('');
  const [station, setStation] = useState('');
  const [notes, setNotes] = useState('');

  // Load assets & drivers for dropdowns
  const loadLookups = useCallback(async () => {
    setLookupsLoading(true);
    try {
      const [assetsRes, driversRes] = await Promise.all([
        axios.get('/api/assets?limit=200', { withCredentials: true }),
        axios.get('/api/drivers?limit=200', { withCredentials: true }),
      ]);

      const assetItems = assetsRes.data.data?.items || assetsRes.data.data || [];
      setAssets(
        assetItems.map((a: Record<string, unknown>) => ({
          id: (a.id || a._id) as string,
          name: (a.name || a.assetName || `${a.year || ''} ${a.make || ''} ${a.model || ''}`) as string,
          assetNumber: a.assetNumber as string | undefined,
          make: a.make as string | undefined,
          model: a.model as string | undefined,
        })),
      );

      const driverItems = driversRes.data.data?.items || driversRes.data.data || [];
      setDrivers(
        driverItems.map((d: Record<string, unknown>) => ({
          id: (d.id || d._id) as string,
          name: `${d.firstName || ''} ${d.lastName || ''}`.trim() as string,
        })),
      );
    } catch {
      // Non-critical: dropdowns will be empty
    } finally {
      setLookupsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  // Populate form with transaction data (edit mode)
  useEffect(() => {
    if (transaction && mode === 'edit') {
      setAssetId(transaction.assetId || '');
      setDriverId(transaction.driverId || '');
      setDate(transaction.date ? transaction.date.split('T')[0] : '');
      setFuelType(transaction.fuelType || 'diesel');
      setVolume(transaction.volume != null ? String(transaction.volume) : '');
      setUnitCost(transaction.unitCost != null ? String(transaction.unitCost) : '');
      setTotalCost(transaction.totalCost != null ? String(transaction.totalCost) : '');
      setStartMileage(transaction.startMileage != null ? String(transaction.startMileage) : '');
      setEndMileage(transaction.endMileage != null ? String(transaction.endMileage) : '');
      setStation(transaction.station || '');
      setNotes(transaction.notes || '');
    }
  }, [transaction, mode]);

  // Auto-calculate total cost from volume * unitCost. Tracks a flag so a
  // previously auto-filled total keeps following volume/unit-cost edits —
  // without it, correcting the volume left the stale total in place and the
  // record self-contradicted (unitCost × volume ≠ totalCost).
  const totalAutoFilled = useRef(false);
  useEffect(() => {
    if (volume && unitCost && (!totalCost || totalAutoFilled.current)) {
      const computed = parseFloat(volume) * parseFloat(unitCost);
      if (!isNaN(computed)) {
        setTotalCost(computed.toFixed(2));
        totalAutoFilled.current = true;
      }
    }
  }, [volume, unitCost]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    // Client-side validation
    const errors: Record<string, string> = {};
    if (!assetId) errors.assetId = 'Asset is required';
    if (!date) errors.date = 'Date is required';
    if (!volume || parseFloat(volume) <= 0) errors.volume = 'Volume must be a positive number';
    if (!totalCost || parseFloat(totalCost) < 0) errors.totalCost = 'Total cost is required';

    if (startMileage && endMileage && parseFloat(endMileage) < parseFloat(startMileage)) {
      errors.endMileage = 'End odometer must be greater than start odometer';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const payload = {
      assetId,
      // 'none' is the select's explicit no-driver option — the server rejects
      // it as an invalid ObjectId if sent through.
      driverId: driverId && driverId !== 'none' ? driverId : undefined,
      date,
      fuelType,
      volume: parseFloat(volume),
      unitCost: unitCost ? parseFloat(unitCost) : undefined,
      totalCost: parseFloat(totalCost),
      startMileage: startMileage ? parseFloat(startMileage) : undefined,
      endMileage: endMileage ? parseFloat(endMileage) : undefined,
      station: station.trim() || undefined,
      notes: notes.trim() || undefined,
      source: 'manual',
    };

    try {
      setSaving(true);
      if (mode === 'edit' && transaction) {
        await axios.put(`/api/fuel/${transaction.id}`, payload, { withCredentials: true });
      } else {
        await axios.post('/api/fuel', payload, { withCredentials: true });
      }
      showSuccessToast(mode === 'edit' ? 'Fuel transaction updated successfully' : 'Fuel transaction created successfully');
      onSaved();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const errData = err.response.data.error;
        if (typeof errData === 'object') {
          setFieldErrors(errData as Record<string, string>);
          showErrorToast('Please fix the highlighted errors');
        } else {
          setError(String(errData));
          showErrorToast(String(errData));
        }
      } else {
        setError('Failed to save fuel transaction');
        showErrorToast('Failed to save fuel transaction');
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
          {mode === 'edit' ? 'Edit Transaction' : 'Add Fuel Transaction'}
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Form body */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Asset & Driver Section */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Asset & Driver</h3>
            <Separator className="mb-4" />
            <div className="space-y-4">
              <SearchableSelect
                options={assets.map((a) => ({
                  label: a.name,
                  value: a.id,
                  meta: [a.assetNumber ? `#${a.assetNumber}` : '', a.make, a.model].filter(Boolean).join(' · '),
                }))}
                value={assetId || null}
                loading={lookupsLoading}
                onValueChange={(v) => { setAssetId(v || ''); clearFieldError('assetId'); }}
                placeholder="Search and select asset..."
                searchPlaceholder="Search by name, number, make, or model..."
                emptyMessage="No assets found"
                label="Asset"
                required
                error={fieldErrors.assetId}
                className="mt-0"
              />
              <SearchableSelect
                options={drivers.map((d) => ({ label: d.name, value: d.id }))}
                loading={lookupsLoading}
                value={driverId || null}
                onValueChange={(v) => setDriverId(v || '')}
                placeholder="Select driver (optional)"
                searchPlaceholder="Search drivers..."
                emptyMessage="No drivers found"
                label="Driver"
                className="mt-0"
              />
            </div>
          </div>

          {/* Transaction Details Section */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Transaction Details</h3>
            <Separator className="mb-4" />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <DateField
                    id="date"
                    label="Date"
                    required
                    value={date}
                    onChange={(v) => { setDate(v); clearFieldError('date'); }}
                    error={fieldErrors.date}
                    placeholder="Select date"
                  />
                </div>
                <div>
                  <Label htmlFor="fuelType">Fuel Type</Label>
                  <Select value={fuelType} onValueChange={setFuelType}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Select fuel type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="gasoline">Gasoline</SelectItem>
                      <SelectItem value="electric">Electric</SelectItem>
                      <SelectItem value="cng">CNG</SelectItem>
                      <SelectItem value="lpg">LPG</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="station">Station</Label>
                <Input
                  id="station"
                  value={station}
                  onChange={(e) => { setStation(e.target.value); clearFieldError('station'); }}
                  placeholder="Fuel station name"
                  className={`mt-1.5 ${fieldErrors.station ? 'border-destructive' : ''}`}
                />
                {fieldErrors.station && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.station}</p>
                )}
              </div>
            </div>
          </div>

          {/* Cost & Volume Section */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Cost & Volume</h3>
            <Separator className="mb-4" />
            <div className="space-y-4">
              <div>
                <Label htmlFor="volume">
                  Volume (gallons) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="volume"
                  type="number"
                  step="0.01"
                  min="0"
                  value={volume}
                  onChange={(e) => { setVolume(e.target.value); clearFieldError('volume'); }}
                  placeholder="0.00"
                  className={`mt-1.5 ${fieldErrors.volume ? 'border-destructive' : ''}`}
                />
                {fieldErrors.volume && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.volume}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="unitCost">Unit Cost ($)</Label>
                  <Input
                    id="unitCost"
                    type="number"
                    step="0.001"
                    min="0"
                    value={unitCost}
                    onChange={(e) => { setUnitCost(e.target.value); clearFieldError('unitCost'); }}
                    placeholder="0.000"
                    className={`mt-1.5 ${fieldErrors.unitCost ? 'border-destructive' : ''}`}
                  />
                  {fieldErrors.unitCost && (
                    <p className="text-sm text-destructive mt-1">{fieldErrors.unitCost}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="totalCost">
                    Total Cost ($) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="totalCost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={totalCost}
                    onChange={(e) => { setTotalCost(e.target.value); totalAutoFilled.current = false; clearFieldError('totalCost'); }}
                    placeholder="0.00"
                    className={`mt-1.5 ${fieldErrors.totalCost ? 'border-destructive' : ''}`}
                  />
                  {fieldErrors.totalCost && (
                    <p className="text-sm text-destructive mt-1">{fieldErrors.totalCost}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Odometer Section */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Odometer</h3>
            <Separator className="mb-4" />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startMileage">Start Odometer (km)</Label>
                  <Input
                    id="startMileage"
                    type="number"
                    step="1"
                    min="0"
                    value={startMileage}
                    onChange={(e) => { setStartMileage(e.target.value); clearFieldError('startMileage'); }}
                    placeholder="0"
                    className={`mt-1.5 ${fieldErrors.startMileage ? 'border-destructive' : ''}`}
                  />
                  {fieldErrors.startMileage && (
                    <p className="text-sm text-destructive mt-1">{fieldErrors.startMileage}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="endMileage">End Odometer (km)</Label>
                  <Input
                    id="endMileage"
                    type="number"
                    step="1"
                    min="0"
                    value={endMileage}
                    onChange={(e) => { setEndMileage(e.target.value); clearFieldError('endMileage'); }}
                    placeholder="0"
                    className={`mt-1.5 ${fieldErrors.endMileage ? 'border-destructive' : ''}`}
                  />
                  {fieldErrors.endMileage && (
                    <p className="text-sm text-destructive mt-1">{fieldErrors.endMileage}</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Providing start and end odometer readings enables automatic calculation of distance, fuel economy, and cost per km.
              </p>
            </div>
          </div>

          {/* Notes Section */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Notes</h3>
            <Separator className="mb-4" />
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => { setNotes(e.target.value); clearFieldError('notes'); }}
                placeholder="Optional notes..."
                className={`mt-1.5 ${fieldErrors.notes ? 'border-destructive' : ''}`}
              />
              {fieldErrors.notes && (
                <p className="text-sm text-destructive mt-1">{fieldErrors.notes}</p>
              )}
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
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <LoadingButton onClick={handleSubmit} loading={saving}>
          {mode === 'edit' ? 'Update Transaction' : 'Create Transaction'}
        </LoadingButton>
      </div>
    </div>
  );
}
