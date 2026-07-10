'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ChevronRight, Settings, SquarePen } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/ui/date-field';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BaseForm } from '@/components/ui/base-form';
import { AssetTypeDialog } from './asset-type-dialog';
import { CURRENCIES } from '@/constants/assets';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { AssetTypeOption, TeamOption, FormItem } from './types';
import { showSuccessToast, showErrorToast } from '@/lib/toastUtils';

interface AssetFormProps {
  mode: 'create' | 'edit';
  initialData?: Record<string, unknown>;
  assetId?: string;
}

export function AssetForm({ mode, initialData, assetId }: AssetFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [assetTypeDialogOpen, setAssetTypeDialogOpen] = useState(false);
  const [assetTypes, setAssetTypes] = useState<AssetTypeOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);

  // Forms
  const [formsList, setFormsList] = useState<FormItem[]>([]);
  const [formsLoading, setFormsLoading] = useState(true);
  const [selectedFormIds, setSelectedFormIds] = useState<Set<string>>(new Set());

  // Service Plans
  const [servicePlansList, setServicePlansList] = useState<{ id: string; name: string }[]>([]);
  const [servicePlansLoading, setServicePlansLoading] = useState(true);
  const [selectedServicePlanId, setSelectedServicePlanId] = useState<string | null>(null);

  const [vinDecoding, setVinDecoding] = useState(false);
  const [vinDecoded, setVinDecoded] = useState(false);

  // Form fields — Manufacturer Details
  const [name, setName] = useState('');
  const [vin, setVin] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [tireSize, setTireSize] = useState('');
  const [notes, setNotes] = useState('');

  // Form fields — Other Details
  const [teamId, setTeamId] = useState('');
  const [mileage, setMileage] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [engineHours, setEngineHours] = useState('');
  const [assetTypeId, setAssetTypeId] = useState('');
  const [lastServiceDate, setLastServiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [lastServiceMileage, setLastServiceMileage] = useState('');
  const [lastServiceEngineHours, setLastServiceEngineHours] = useState('');
  const [hubometer, setHubometer] = useState('');

  // Photo upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Populate form with initial data (edit or VIN-decoded create)
  useEffect(() => {
    if (initialData) {
      // Auto-generate name from VIN-decoded data if no name provided
      const dataName = initialData.name as string | undefined;
      if (dataName) {
        setName(dataName);
      } else if (mode === 'create') {
        const parts = [
          initialData.year ? String(initialData.year) : '',
          (initialData.make as string) || '',
          (initialData.model as string) || '',
        ].filter(Boolean);
        setName(parts.join(' '));
      }
      const initVin = (initialData.vin as string) || '';
      setVin(initVin);
      if (initVin) setVinDecoded(true);
      setLicensePlate((initialData.licensePlate as string) || '');
      setMake((initialData.make as string) || '');
      setModel((initialData.model as string) || '');
      setYear(initialData.year ? String(initialData.year) : '');
      setColor((initialData.color as string) || '');
      setTireSize((initialData.tireSize as string) || '');
      setNotes((initialData.notes as string) || '');
      setTeamId(
        Array.isArray(initialData.teamIds) && initialData.teamIds.length > 0
          ? initialData.teamIds[0]
          : '',
      );
      setMileage(initialData.currentOdometer != null ? String(initialData.currentOdometer) : '');
      setEstimatedCost(initialData.estimatedCost != null ? String(initialData.estimatedCost) : '');
      setCurrencyCode((initialData.currencyCode as string) || 'USD');
      setEngineHours(
        initialData.currentEngineHours != null ? String(initialData.currentEngineHours) : '',
      );
      setAssetTypeId((initialData.assetTypeId as string) || '');
      setLastServiceDate(
        initialData.lastServiceDate
          ? (initialData.lastServiceDate as string).split('T')[0]
          : '',
      );
      setLastServiceMileage(
        initialData.lastServiceMileage != null ? String(initialData.lastServiceMileage) : '',
      );
      setLastServiceEngineHours(
        initialData.lastServiceEngineHours != null
          ? String(initialData.lastServiceEngineHours)
          : '',
      );
      setHubometer(
        initialData.hubometer != null ? String(initialData.hubometer) : '',
      );
      // Set photo preview from existing data
      const urls = initialData.photoUrls as string[] | undefined;
      if (urls && urls.length > 0) {
        setPhotoPreview(urls[0]);
      }
      // Populate forms selections
      if (Array.isArray(initialData.formIds)) {
        setSelectedFormIds(new Set(initialData.formIds as string[]));
      }
      // Populate service plan selection
      if (initialData.servicePlanId) {
        setSelectedServicePlanId(initialData.servicePlanId as string);
      }
    }
  }, [initialData]);

  // Once asset types are loaded, resolve vehicleType from VIN-decoded initialData
  useEffect(() => {
    const vehicleType = initialData?.vehicleType as string | undefined;
    if (vehicleType && assetTypes.length > 0 && !assetTypeId) {
      resolveAssetTypeByName(vehicleType, assetTypes).then((id) => {
        if (id) setAssetTypeId(id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetTypes]);

  const fetchAssetTypes = useCallback(async () => {
    try {
      const res = await axios.get('/api/inventory-settings/asset-types', { withCredentials: true });
      setAssetTypes(res.data.data || []);
    } catch {
      // Silently fail
    }
  }, []);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await axios.get('/api/teams?limit=100', { withCredentials: true });
      setTeams(res.data.data?.items || []);
    } catch {
      setTeams([]);
    }
  }, []);

  const fetchForms = useCallback(async () => {
    try {
      setFormsLoading(true);
      // Auto-seed pre-start forms (idempotent — skips if already seeded)
      await axios.post('/api/forms/seed-prestart', {}, { withCredentials: true }).catch(() => {});
      const res = await axios.get('/api/forms?includeSchema=true', { withCredentials: true });
      const items = res.data.data?.items || [];
      setFormsList(
        items
          .filter((f: Record<string, unknown>) => !(f.title as string)?.toLowerCase().includes('driver wellness'))
          .map((f: Record<string, unknown>) => ({
            id: f.id as string,
            formId: (f.formId as string) || (f.id as string),
            title: (f.title as string) || '',
            schema: (f.currentSchema as FormItem['schema']) || null,
          })),
      );
    } catch {
      setFormsList([]);
    } finally {
      setFormsLoading(false);
    }
  }, []);

  const fetchServicePlans = useCallback(async () => {
    try {
      setServicePlansLoading(true);
      const res = await axios.get('/api/service-plans?limit=100', { withCredentials: true });
      const items = res.data.data?.items || [];
      setServicePlansList(
        items
          .filter((p: Record<string, unknown>) => !p.isArchived)
          .map((p: Record<string, unknown>) => ({
            id: p.id as string,
            name: (p.name as string) || '',
          })),
      );
    } catch {
      setServicePlansList([]);
    } finally {
      setServicePlansLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssetTypes();
    fetchTeams();
    fetchForms();
    fetchServicePlans();
  }, [fetchAssetTypes, fetchTeams, fetchForms, fetchServicePlans]);

  /**
   * Find an existing asset type by name (case-insensitive) or create a new one.
   * Returns the assetTypeId or empty string.
   */
  const resolveAssetTypeByName = useCallback(async (vehicleTypeName: string, types: AssetTypeOption[]): Promise<string> => {
    if (!vehicleTypeName) return '';
    const lower = vehicleTypeName.toLowerCase();
    const match = types.find((t) => t.name.toLowerCase() === lower);
    if (match) return match.id;

    // Auto-create asset type
    try {
      const res = await axios.post('/api/inventory-settings/asset-types', { name: vehicleTypeName }, { withCredentials: true });
      const created = res.data.data;
      if (created?.id) {
        // Refresh list so it shows in the dropdown
        await fetchAssetTypes();
        return created.id as string;
      }
    } catch {
      // Silently fail — user can still pick manually
    }
    return '';
  }, [fetchAssetTypes]);

  /** Decode the VIN currently in the input field and fill related fields. */
  const handleVinDecode = useCallback(async () => {
    const trimmed = vin.trim().toUpperCase();
    if (trimmed.length < 5) return;

    setVinDecoding(true);
    setError('');
    try {
      const res = await axios.get(`/api/vin-decode?vin=${encodeURIComponent(trimmed)}`, { withCredentials: true });
      const data = res.data.data;
      if (!data) {
        setError(res.data.error || 'Failed to decode VIN');
        return;
      }

      // Fill decoded fields
      if (data.vin) setVin(data.vin);
      if (data.make) setMake(data.make);
      if (data.model) setModel(data.model);
      if (data.year) setYear(data.year);
      if (data.color) setColor(data.color);
      if (data.licensePlate) setLicensePlate(data.licensePlate);
      setVinDecoded(true);

      // Auto-generate name if empty
      if (!name.trim()) {
        const parts = [data.year, data.make, data.model].filter(Boolean);
        if (parts.length > 0) setName(parts.join(' '));
      }

      // Resolve asset type from vehicleType
      if (data.vehicleType) {
        const typeId = await resolveAssetTypeByName(data.vehicleType, assetTypes);
        if (typeId) setAssetTypeId(typeId);
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('Failed to decode VIN');
      }
    } finally {
      setVinDecoding(false);
    }
  }, [vin, name, assetTypes, resolveAssetTypeByName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    // Validate required fields
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Asset name is required';
    if (vin.trim() && (vin.trim().length < 5 || vin.trim().length > 17)) errors.vin = 'Rego / chassis number must be between 5 and 17 characters';
    if (year && (parseInt(year, 10) < 1900 || parseInt(year, 10) > 2100)) errors.year = 'Year must be between 1900 and 2100';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    // Build photoUrls: keep existing URLs + add new file if selected
    let photoUrls: string[] = [];
    if (initialData?.photoUrls && Array.isArray(initialData.photoUrls)) {
      photoUrls = [...(initialData.photoUrls as string[])];
    }

    // If a new photo file was selected, upload it via the upload endpoint
    if (photoFile) {
      try {
        const formData = new FormData();
        formData.append('file', photoFile);
        const uploadRes = await axios.post('/api/upload', formData, {
          withCredentials: true,
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (uploadRes.data?.data?.url) {
          photoUrls = [uploadRes.data.data.url];
        }
      } catch {
        // Upload endpoint may not be available yet; continue without photo
      }
    }

    const payload = {
      name: name.trim(),
      photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
      vin: vin.trim() || undefined,
      licensePlate: licensePlate.trim() || undefined,
      make: make.trim() || undefined,
      model: model.trim() || undefined,
      year: year ? parseInt(year, 10) : undefined,
      color: color.trim() || undefined,
      tireSize: tireSize.trim() || undefined,
      notes: notes.trim() || undefined,
      teamIds: teamId ? [teamId] : [],
      currentOdometer: mileage ? parseFloat(mileage) : undefined,
      estimatedCost: estimatedCost ? parseFloat(estimatedCost) : undefined,
      currencyCode: currencyCode || 'USD',
      currentEngineHours: engineHours ? parseFloat(engineHours) : undefined,
      assetTypeId: assetTypeId || undefined,
      lastServiceDate: lastServiceDate || undefined,
      lastServiceMileage: lastServiceMileage ? parseFloat(lastServiceMileage) : undefined,
      lastServiceEngineHours: lastServiceEngineHours
        ? parseFloat(lastServiceEngineHours)
        : undefined,
      hubometer: hubometer ? parseFloat(hubometer) : undefined,
      formIds: Array.from(selectedFormIds),
      servicePlanId: selectedServicePlanId || null,
    };

    try {
      setSaving(true);
      if (mode === 'edit' && assetId) {
        await axios.put(`/api/assets/${assetId}`, payload, { withCredentials: true });
      } else {
        await axios.post('/api/assets', payload, { withCredentials: true });
      }

      showSuccessToast(mode === 'edit' ? 'Asset updated successfully' : 'Asset created successfully');
      router.push('/assets');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const errData = err.response.data.error;
        if (typeof errData === 'object') {
          setFieldErrors(errData as Record<string, string>);
        } else {
          showErrorToast(String(errData));
          setError(String(errData));
        }
      } else {
        showErrorToast('Failed to save asset');
        setError('Failed to save asset');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseForm
      title={mode === 'edit' ? 'Edit Asset' : 'Add Asset'}
      subtitle={
        mode === 'edit'
          ? 'Update the asset details below'
          : 'Fill in the details to create a new asset'
      }
      onBack={() => router.push('/assets')}
      onSubmit={handleSubmit}
      saving={saving}
      submitLabel={mode === 'edit' ? 'Update Asset' : 'Create Asset'}
      fileInputRef={fileInputRef}
      onPhotoChange={handlePhotoChange}
      photoPreview={photoPreview}
      photoAlt="Asset photo"
      nameFields={
        <div className="group">
          <Label htmlFor="name" className="text-sm font-medium text-muted-foreground mb-1">
            Asset Name <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) setFieldErrors((prev) => { const { name: _, ...rest } = prev; return rest; });
              }}
              placeholder="Enter asset name"
              className={`text-lg font-semibold border-transparent bg-transparent shadow-none px-2 h-auto py-1.5 focus-visible:border-input focus-visible:bg-background focus-visible:shadow-sm hover:border-input hover:bg-background transition-all pr-9 ${fieldErrors.name ? 'border-destructive' : ''}`}
            />
            <SquarePen className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>
          {fieldErrors.name && (
            <p className="text-sm text-destructive mt-1">{fieldErrors.name}</p>
          )}
        </div>
      }
      sections={[
        {
          title: 'Manufacturer Details',
          children: (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vin">Rego Number</Label>
                <div className="relative mt-1.5">
                  <Input
                    id="vin"
                    value={vin}
                    onChange={(e) => {
                      setVin(e.target.value);
                      if (vinDecoded) setVinDecoded(false);
                      if (fieldErrors.vin) setFieldErrors((prev) => { const { vin: _, ...rest } = prev; return rest; });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && vin.trim().length >= 5) {
                        e.preventDefault();
                        handleVinDecode();
                      }
                    }}
                    placeholder="Rego or chassis number"
                    disabled={vinDecoding}
                    className={`pr-20 ${fieldErrors.vin ? 'border-destructive' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={handleVinDecode}
                    disabled={vinDecoding || vinDecoded || vin.trim().length < 5}
                    className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  >
                    {vinDecoding && <Spinner size="sm" />}
                    Decode
                  </button>
                </div>
                {fieldErrors.vin && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.vin}</p>
                )}
              </div>
              <div>
                <Label htmlFor="licensePlate">License</Label>
                <Input
                  id="licensePlate"
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value)}
                  placeholder="License plate"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  placeholder="e.g. Ford"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. F-150"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={year}
                  onChange={(e) => {
                    setYear(e.target.value);
                    if (fieldErrors.year) setFieldErrors((prev) => { const { year: _, ...rest } = prev; return rest; });
                  }}
                  placeholder="e.g. 2024"
                  min={1900}
                  max={2100}
                  className={`mt-1.5 ${fieldErrors.year ? 'border-destructive' : ''}`}
                />
                {fieldErrors.year && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.year}</p>
                )}
              </div>
              <div>
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="e.g. White"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="tireSize">Tire Size</Label>
                <Input
                  id="tireSize"
                  value={tireSize}
                  onChange={(e) => setTireSize(e.target.value)}
                  placeholder="e.g. 265/70R17"
                  className="mt-1.5"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes..."
                  rows={3}
                  className="mt-1.5"
                />
              </div>
            </div>
          ),
        },
        {
          title: 'Other Details',
          children: (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <SearchableSelect
                  label="Team"
                  options={teams.map((t) => ({ label: t.name, value: t.id }))}
                  value={teamId || null}
                  onValueChange={(val) => setTeamId(val || '')}
                  placeholder="Select team"
                  searchPlaceholder="Search teams..."
                  emptyMessage="No teams found"
                  isClearable
                />
              </div>
              <div className="col-span-2 grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="mileage">Odometer (km)</Label>
                  <Input
                    id="mileage"
                    type="number"
                    value={mileage}
                    onChange={(e) => setMileage(e.target.value)}
                    placeholder="Current odometer"
                    min={0}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="hubometer">Hubometer</Label>
                  <Input
                    id="hubometer"
                    type="number"
                    value={hubometer}
                    onChange={(e) => setHubometer(e.target.value)}
                    placeholder="Current hubometer reading"
                    min={0}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="engineHours">Engine Hours</Label>
                  <Input
                    id="engineHours"
                    type="number"
                    value={engineHours}
                    onChange={(e) => setEngineHours(e.target.value)}
                    placeholder="Current engine hours"
                    min={0}
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="assetType">Asset Type</Label>
                  <button
                    type="button"
                    onClick={() => setAssetTypeDialogOpen(true)}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Settings className="h-3 w-3" />
                    Edit Asset Types
                  </button>
                </div>
                <SearchableSelect
                  className="mt-1.5"
                  options={assetTypes.map((t) => ({ label: t.name, value: t.id }))}
                  value={assetTypeId || null}
                  onValueChange={(val) => setAssetTypeId(val || '')}
                  placeholder="Select type"
                  searchPlaceholder="Search asset types..."
                  emptyMessage="No asset types found"
                />
              </div>
              <div>
                <Label htmlFor="estimatedCost">Estimated Cost</Label>
                <div className="flex gap-2 mt-1.5">
                  <Select value={currencyCode} onValueChange={setCurrencyCode}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="estimatedCost"
                    type="number"
                    value={estimatedCost}
                    onChange={(e) => setEstimatedCost(e.target.value)}
                    placeholder="0.00"
                    min={0}
                    step="0.01"
                    className="flex-1"
                  />
                </div>
              </div>
              <div>
                <DateField id="lastServiceDate" label="Last Service Date" value={lastServiceDate} onChange={setLastServiceDate} placeholder="Select date" />
              </div>
              <div>
                <Label htmlFor="lastServiceMileage">Last Service Odometer (km)</Label>
                <Input
                  id="lastServiceMileage"
                  type="number"
                  value={lastServiceMileage}
                  onChange={(e) => setLastServiceMileage(e.target.value)}
                  placeholder="0"
                  min={0}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="lastServiceEngineHours">Last Service Engine Hours</Label>
                <Input
                  id="lastServiceEngineHours"
                  type="number"
                  value={lastServiceEngineHours}
                  onChange={(e) => setLastServiceEngineHours(e.target.value)}
                  placeholder="0"
                  min={0}
                  className="mt-1.5"
                />
              </div>
            </div>
          ),
        },
        {
          title: 'Forms',
          headerRight: (
            <button
              type="button"
              onClick={() => {
                const allSelected = formsList.length > 0 && formsList.every((f) => selectedFormIds.has(f.id));
                if (allSelected) {
                  setSelectedFormIds(new Set());
                } else {
                  setSelectedFormIds(new Set(formsList.map((f) => f.id)));
                }
              }}
              className="text-xs text-primary hover:underline font-medium"
            >
              {formsList.length > 0 && formsList.every((f) => selectedFormIds.has(f.id)) ? 'Deselect All' : 'Select All'}
            </button>
          ),
          children: (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Select forms available to this asset
              </p>
              <div className="rounded-md border border-border overflow-hidden">
                <div className="max-h-[300px] overflow-y-auto divide-y divide-border">
                  {formsLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                        <Skeleton className="h-4 w-4 rounded-sm shrink-0" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    ))
                  ) : formsList.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      No forms available
                    </p>
                  ) : (
                    formsList.map((form) => (
                      <div
                        key={form.id}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors"
                      >
                        <label className="flex items-center gap-3 flex-1 cursor-pointer">
                          <Checkbox
                            checked={selectedFormIds.has(form.id)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedFormIds);
                              if (checked) next.add(form.id);
                              else next.delete(form.id);
                              setSelectedFormIds(next);
                            }}
                          />
                          <span className="text-sm text-foreground">{form.title}</span>
                        </label>
                        <a
                          href={`/inspections/forms/${form.formId}/defect-settings`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Configure defect settings for this form (opens in a new tab)"
                        >
                          <Settings className="h-4 w-4" />
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>
              {selectedFormIds.size > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {selectedFormIds.size} form{selectedFormIds.size !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          ),
        },
        {
          title: 'Service Plans',
          headerRight: selectedServicePlanId ? (
            <button
              type="button"
              onClick={() => setSelectedServicePlanId(null)}
              className="text-xs text-primary hover:underline font-medium"
            >
              Clear Selection
            </button>
          ) : undefined,
          children: (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Select a service plan for this asset
              </p>
              <div className="rounded-md border border-border overflow-hidden">
                <div className="max-h-[300px] overflow-y-auto divide-y divide-border">
                  {servicePlansLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                        <Skeleton className="h-4 w-4 rounded-full shrink-0" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    ))
                  ) : servicePlansList.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      No service plans available
                    </p>
                  ) : (
                    servicePlansList.map((plan) => (
                      <div
                        key={plan.id}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors"
                      >
                        <label className="flex items-center gap-3 flex-1 cursor-pointer">
                          <Checkbox
                            checked={selectedServicePlanId === plan.id}
                            onCheckedChange={(checked) => {
                              setSelectedServicePlanId(checked ? plan.id : null);
                            }}
                          />
                          <span className="text-sm text-foreground">{plan.name}</span>
                        </label>
                        <a
                          href="/maintenance/service-plans"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded-md hover:bg-muted text-primary hover:text-primary/80 transition-colors"
                          title="Manage service plans (opens in a new tab)"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>
              {selectedServicePlanId && (
                <p className="text-xs text-muted-foreground mt-2">
                  1 service plan selected
                </p>
              )}
            </div>
          ),
        },
      ]}
      error={error}
    >
      <AssetTypeDialog
        open={assetTypeDialogOpen}
        onOpenChange={setAssetTypeDialogOpen}
        onTypeCreated={fetchAssetTypes}
      />
    </BaseForm>
  );
}
