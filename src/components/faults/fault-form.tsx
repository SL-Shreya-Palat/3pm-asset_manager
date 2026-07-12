'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { Button, LoadingButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/ui/date-field';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import type { FaultRow } from './types';
import { useAuth } from '@/hooks/useAuth';

interface UserLookup {
  id: string;
  name: string;
  email: string;
}

interface FaultFormProps {
  mode: 'create' | 'edit';
  fault?: FaultRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function FaultForm({ mode, fault, onClose, onSaved }: FaultFormProps) {
  const { user } = useAuth();
  // Mechanics keep full edit on faults except Asset/Reporter, which they can't
  // access — those are shown disabled (seeded from the record).
  const isMechanic = user?.tenant?.isMechanic === true;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reportedAt, setReportedAt] = useState(getTodayDateString());
  const [assetId, setAssetId] = useState('');
  const [reportedById, setReportedById] = useState('');
  const [status, setStatus] = useState('open');
  const [meterType, setMeterType] = useState('');
  const [meterReading, setMeterReading] = useState('');
  const [takeOutOfService, setTakeOutOfService] = useState(false);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);

  // Members (for Reported By) are still fetched here because the create form
  // pre-selects the logged-in user. Assets use <LookupSelect> directly.
  const [members, setMembers] = useState<UserLookup[]>([]);
  const [membersLoading, setMembersLoading] = useState(!isMechanic);

  // Fetch members
  const fetchLookups = useCallback(async () => {
    // Mechanics can't access the users endpoint (403); Reported By is disabled
    // and seeded from the fault instead.
    if (isMechanic) { setMembersLoading(false); return; }
    setMembersLoading(true);
    try {
      const usersRes = await axios.get('/api/users?limit=100', { withCredentials: true });

      const userItems = usersRes.data.data?.items || usersRes.data.data || [];
      const mappedMembers = userItems.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        name: (i.name as string) || `${(i.firstName as string) || ''} ${(i.lastName as string) || ''}`.trim() || (i.email as string) || '',
        email: (i.email as string) || '',
      }));
      setMembers(mappedMembers);

      // Pre-populate reportedById with logged-in user on create
      if (mode === 'create' && user?.email) {
        const match = mappedMembers.find(
          (m: UserLookup) => m.email.toLowerCase() === user.email.toLowerCase(),
        );
        if (match) {
          setReportedById(match.id);
        }
      }
    } catch {
      // Silent
    } finally {
      setMembersLoading(false);
    }
  }, [mode, user?.email, isMechanic]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchLookups(); }, [fetchLookups]);

  // Populate form (edit mode)
  useEffect(() => {
    if (fault && mode === 'edit') {
      setTitle(fault.title || '');
      setDescription(fault.description || '');
      setReportedAt(fault.reportedAt ? fault.reportedAt.split('T')[0] : '');
      setAssetId(fault.assetId || '');
      setReportedById(fault.reportedById || '');
      setStatus(fault.status || 'open');
      setMeterType(fault.meterType || '');
      setMeterReading(fault.meterReading != null ? String(fault.meterReading) : '');
      setTakeOutOfService(fault.takeOutOfService || false);
      setAttachments(
        (fault.attachments || []).map((a) => ({
          url: a.url,
          filename: a.filename,
          originalName: a.originalName,
          contentType: a.contentType,
          size: a.size,
        })),
      );
    }
  }, [fault, mode]);

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  const handleSubmit = async () => {
    setError('');
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = 'Title is required';
    if (!reportedAt) errors.reportedAt = 'Reported date is required';
    if (!assetId) errors.assetId = 'Asset is required';
    if (!reportedById) errors.reportedById = 'Reporter is required';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim(),
      reportedAt,
      assetId,
      reportedByType: 'member',
      reportedById,
      meterType: meterType || undefined,
      meterReading: meterReading ? Number(meterReading) : undefined,
      takeOutOfService,
      attachments: attachments.map((a) => ({
        url: a.url,
        filename: a.filename,
        originalName: a.originalName,
        contentType: a.contentType,
        size: a.size,
      })),
    };

    if (mode === 'edit') {
      payload.status = status;
    }

    try {
      setSaving(true);
      if (mode === 'edit' && fault) {
        await axios.put(`/api/faults/${fault.id}`, payload, { withCredentials: true });
      } else {
        await axios.post('/api/faults', payload, { withCredentials: true });
      }
      showSuccessToast(mode === 'edit' ? 'Fault updated successfully' : 'Fault created successfully');
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
        setError('Failed to save fault');
        showErrorToast('Failed to save fault');
      }
    } finally {
      setSaving(false);
    }
  };

  const reporterOptions = members.length
    ? members.map((m) => ({ label: m.name, value: m.id }))
    : (fault?.reportedById ? [{ label: fault.reportedByName, value: fault.reportedById }] : []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">
          {mode === 'edit' ? 'Edit Fault' : 'Create Fault'}
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-4">

          {/* Title */}
          <div>
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input
              value={title}
              onChange={(e) => { setTitle(e.target.value); clearFieldError('title'); }}
              placeholder="Brief fault description"
              className={`mt-1.5 ${fieldErrors.title ? 'border-destructive' : ''}`}
            />
            {fieldErrors.title && <p className="text-sm text-destructive mt-1">{fieldErrors.title}</p>}
          </div>

          {/* Description */}
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); clearFieldError('description'); }}
              placeholder="Describe the fault in detail..."
              rows={3}
              maxLength={2000}
              className={`mt-1.5 ${fieldErrors.description ? 'border-destructive' : ''}`}
            />
            {fieldErrors.description && <p className="text-sm text-destructive mt-1">{fieldErrors.description}</p>}
          </div>

          {/* Asset + Reported At */}
          <div className="grid grid-cols-2 gap-4">
            <LookupSelect
              label="Asset"
              required
              endpoint="/api/assets?limit=100"
              mapItem={(a) => ({ label: a.name as string, value: a.id as string })}
              enabled={!isMechanic}
              fallbackOptions={fault?.assetId ? [{ label: fault.assetName, value: fault.assetId }] : []}
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
              label="Reported At"
              required
              value={reportedAt}
              onChange={(v) => { setReportedAt(v); clearFieldError('reportedAt'); }}
              error={fieldErrors.reportedAt}
              placeholder="Select date"
            />
          </div>

          {/* Reported By */}
          <SearchableSelect
            label="Reported By"
            required
            options={reporterOptions}
            loading={membersLoading}
            value={reportedById || null}
            onValueChange={(val) => { setReportedById(val || ''); clearFieldError('reportedById'); }}
            placeholder="Select member"
            searchPlaceholder="Search..."
            emptyMessage="No options found"
            disabled={isMechanic}
            error={fieldErrors.reportedById}
            isClearable
          />

          {/* Status (edit mode only) */}
          {mode === 'edit' && (
            <SearchableSelect
              label="Status"
              options={[
                { label: 'Open', value: 'open' },
                { label: 'In Progress', value: 'in_progress' },
                { label: 'Resolved', value: 'resolved' },
                { label: "Won't Fix", value: 'wont_fix' },
              ]}
              value={status}
              onValueChange={(val) => { if (val) setStatus(val); }}
              placeholder="Select status"
              searchPlaceholder="Search..."
              emptyMessage="No options found"
              isClearable={false}
            />
          )}

          {/* Meter reading (optional) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block">Meter Type</Label>
              <Select
                value={meterType || undefined}
                onValueChange={(val) => setMeterType(val === '__none__' ? '' : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="odometer">Odometer</SelectItem>
                  <SelectItem value="engine_hours">Engine Hours</SelectItem>
                  <SelectItem value="hubometer">Hubometer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Meter Reading</Label>
              <Input
                type="number"
                value={meterReading}
                onChange={(e) => setMeterReading(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Take out of service toggle */}
          <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 cursor-pointer">
            <Checkbox
              checked={takeOutOfService}
              onCheckedChange={(v) => setTakeOutOfService(v === true)}
            />
            <div>
              <p className="text-sm font-medium text-foreground">Take out of service</p>
              <p className="text-xs text-muted-foreground">Ground this asset immediately</p>
            </div>
          </label>

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
