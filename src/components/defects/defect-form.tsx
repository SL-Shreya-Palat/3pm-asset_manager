'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/ui/date-field';
import { Textarea } from '@/components/ui/textarea';
import { AttachmentUploader, type UploadedFile } from '@/components/ui/attachment-uploader';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DefectRow, LookupOption } from './types';

interface DefectFormProps {
  mode: 'create' | 'edit';
  defect?: DefectRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function DefectForm({ mode, defect, onClose, onSaved }: DefectFormProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [comment, setComment] = useState('');
  const [assetId, setAssetId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('new');
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);

  // Lookup data
  const [assets, setAssets] = useState<LookupOption[]>([]);
  const [drivers, setDrivers] = useState<LookupOption[]>([]);

  // Fetch lookup data
  const fetchLookups = useCallback(async () => {
    try {
      const [assetsRes, driversRes] = await Promise.all([
        axios.get('/api/assets?limit=100', { withCredentials: true }),
        axios.get('/api/drivers?limit=100', { withCredentials: true }),
      ]);

      const assetItems = assetsRes.data.data?.items || assetsRes.data.data || [];
      setAssets(assetItems.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        name: i.name as string,
      })));

      const driverItems = driversRes.data.data?.items || driversRes.data.data || [];
      setDrivers(driverItems.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        name: `${(i.firstName as string) || ''} ${(i.lastName as string) || ''}`.trim() || (i.email as string) || '',
      })));
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => { fetchLookups(); }, [fetchLookups]);

  // Populate form (edit mode)
  useEffect(() => {
    if (defect && mode === 'edit') {
      setName(defect.name || '');
      setDate(defect.date ? defect.date.split('T')[0] : '');
      setComment(defect.comment || '');
      setAssetId(defect.assetId || '');
      setDriverId(defect.driverId || '');
      setPriority(defect.priority || '');
      setStatus(defect.status || 'new');
      setAttachments(
        (defect.attachments || []).map((a) => ({
          url: a.url,
          filename: a.filename,
          originalName: a.originalName,
          contentType: a.contentType,
          size: a.size,
        })),
      );
    }
  }, [defect, mode]);

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  const handleSubmit = async () => {
    setError('');
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Defect name is required';
    if (!date) errors.date = 'Date is required';
    if (!assetId) errors.assetId = 'Asset is required';
    if (!priority) errors.priority = 'Severity is required';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      date,
      comment: comment.trim(),
      assetId,
      driverId: driverId || undefined,
      priority,
      status,
      attachments: attachments.map((a) => ({
        url: a.url,
        filename: a.filename,
        originalName: a.originalName,
        contentType: a.contentType,
        size: a.size,
      })),
    };

    try {
      setSaving(true);
      if (mode === 'edit' && defect) {
        await axios.put(`/api/defects/${defect.id}`, payload, { withCredentials: true });
      } else {
        await axios.post('/api/defects', payload, { withCredentials: true });
      }
      onSaved();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const errData = err.response.data.error;
        if (typeof errData === 'object') setFieldErrors(errData as Record<string, string>);
        else setError(String(errData));
      } else {
        setError('Failed to save defect');
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
          {mode === 'edit' ? 'Edit Defect' : 'Create Defect'}
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-4">

          {/* Defect Name */}
          <div>
            <Label>Defect Name <span className="text-destructive">*</span></Label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); clearFieldError('name'); }}
              placeholder="Enter defect name"
              className={`mt-1.5 ${fieldErrors.name ? 'border-destructive' : ''}`}
            />
            {fieldErrors.name && <p className="text-sm text-destructive mt-1">{fieldErrors.name}</p>}
          </div>

          {/* Comment */}
          <div>
            <Label>Comment</Label>
            <Textarea
              value={comment}
              onChange={(e) => { setComment(e.target.value); clearFieldError('comment'); }}
              placeholder="Describe the defect..."
              rows={3}
              maxLength={2000}
              className={`mt-1.5 ${fieldErrors.comment ? 'border-destructive' : ''}`}
            />
            {fieldErrors.comment && <p className="text-sm text-destructive mt-1">{fieldErrors.comment}</p>}
          </div>

          {/* Asset + Date */}
          <div className="grid grid-cols-2 gap-4">
            <SearchableSelect
              label="Asset"
              required
              options={assets.map((a) => ({ label: a.name, value: a.id }))}
              value={assetId || null}
              onValueChange={(val) => { setAssetId(val || ''); clearFieldError('assetId'); }}
              placeholder="Select asset"
              searchPlaceholder="Search assets..."
              emptyMessage="No assets found"
              error={fieldErrors.assetId}
              isClearable
            />
            <DateField
              label="Date"
              required
              value={date}
              onChange={(v) => { setDate(v); clearFieldError('date'); }}
              error={fieldErrors.date}
              placeholder="Select date"
            />
          </div>

          {/* Driver + Severity */}
          <div className="grid grid-cols-2 gap-4">
            <SearchableSelect
              label="Driver"
              options={drivers.map((d) => ({ label: d.name, value: d.id }))}
              value={driverId || null}
              onValueChange={(val) => setDriverId(val || '')}
              placeholder="Select driver (optional)"
              searchPlaceholder="Search drivers..."
              emptyMessage="No drivers found"
              isClearable
            />
            <div>
              <Label className="mb-1.5 block">
                Severity <span className="text-destructive">*</span>
              </Label>
              <Select
                value={priority || undefined}
                onValueChange={(val) => { setPriority(val); clearFieldError('priority'); }}
              >
                <SelectTrigger className={fieldErrors.priority ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              {fieldErrors.priority && <p className="text-sm text-destructive mt-1">{fieldErrors.priority}</p>}
            </div>
          </div>

          {/* Status (edit mode only) */}
          {mode === 'edit' && (
            <SearchableSelect
              label="Status"
              options={[
                { label: 'New', value: 'new' },
                { label: 'In Progress', value: 'in_progress' },
                { label: 'Corrected', value: 'corrected' },
                { label: 'No Correction Needed', value: 'no_correction_needed' },
              ]}
              value={status}
              onValueChange={(val) => { if (val) setStatus(val); }}
              placeholder="Select status"
              searchPlaceholder="Search..."
              emptyMessage="No options found"
              isClearable={false}
            />
          )}

          {/* Attachments */}
          <div>
            <Label className="mb-1.5 block">Attachments</Label>
            <AttachmentUploader
              variant="dropzone"
              files={attachments}
              onChange={setAttachments}
              accept=".doc,.docx,.pdf,.csv,.xls,.xlsx,.jpg,.jpeg,.png,.heic"
              hint="DOC, PDF, CSV, XLS, JPG, HEIC or PNG (max. 50 MB)"
              onError={setError}
            />
          </div>

          {/* Error banner */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving...' : mode === 'edit' ? 'Update' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
