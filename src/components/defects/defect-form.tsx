'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { Button, LoadingButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/ui/date-field';
import { Textarea } from '@/components/ui/textarea';
import { AttachmentUploader, type UploadedFile } from '@/components/ui/attachment-uploader';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { LookupSelect } from '@/components/ui/lookup-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getTodayDateString } from '@/lib/utils';
import { showSuccessToast, showErrorToast } from '@/lib/toastUtils';
import { useAuth } from '@/hooks/useAuth';
import type { DefectRow } from './types';

interface DefectFormProps {
  mode: 'create' | 'edit';
  defect?: DefectRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function DefectForm({ mode, defect, onClose, onSaved }: DefectFormProps) {
  const { user } = useAuth();
  // Mechanics keep full edit on defects except the Asset/Driver, which they
  // can't access — those are shown disabled (seeded from the record).
  const isMechanic = user?.tenant?.isMechanic === true;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields
  const [name, setName] = useState('');
  const [date, setDate] = useState(getTodayDateString());
  const [comment, setComment] = useState('');
  const [assetId, setAssetId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('new');
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);

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
      showSuccessToast(mode === 'edit' ? 'Defect updated successfully' : 'Defect created successfully');
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
        setError('Failed to save defect');
        showErrorToast('Failed to save defect');
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
            <LookupSelect
              label="Asset"
              required
              endpoint="/api/assets?limit=100"
              mapItem={(a) => ({ label: a.name as string, value: a.id as string })}
              enabled={!isMechanic}
              fallbackOptions={defect?.assetId ? [{ label: defect.assetName, value: defect.assetId }] : []}
              value={assetId || null}
              onValueChange={(val) => { setAssetId(val || ''); clearFieldError('assetId'); }}
              placeholder="Select asset"
              searchPlaceholder="Search assets..."
              emptyMessage="No assets found"
              disabled={isMechanic}
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
            <LookupSelect
              label="Driver"
              endpoint="/api/drivers?limit=100"
              mapItem={(d) => ({ label: `${(d.firstName as string) || ''} ${(d.lastName as string) || ''}`.trim() || (d.email as string) || '', value: d.id as string })}
              enabled={!isMechanic}
              fallbackOptions={defect?.driverId ? [{ label: defect.driverName || '', value: defect.driverId }] : []}
              value={driverId || null}
              onValueChange={(val) => setDriverId(val || '')}
              placeholder="Select driver (optional)"
              searchPlaceholder="Search drivers..."
              emptyMessage="No drivers found"
              disabled={isMechanic}
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
        <LoadingButton type="button" onClick={handleSubmit} loading={saving}>
          {mode === 'edit' ? 'Update' : 'Save'}
        </LoadingButton>
      </div>
    </div>
  );
}
