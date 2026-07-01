'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { AttachmentUploader, type UploadedFile } from '@/components/ui/attachment-uploader';
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
  const [severity, setSeverity] = useState('');
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
      setSeverity(defect.severity || '');
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
    if (!comment.trim()) errors.comment = 'Comment is required';
    if (!assetId) errors.assetId = 'Asset is required';
    if (!priority) errors.priority = 'Priority is required';
    if (!severity) errors.severity = 'Severity is required';

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
      severity,
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
        <div className="p-6 space-y-6">

          {/* ── Defect Name ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Defect Details</h3>
            <Separator className="mb-4" />
            <div className="space-y-4">
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

              {/* ── Date ── */}
              <div>
                <Label>Date <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => { setDate(e.target.value); clearFieldError('date'); }}
                  className={`mt-1.5 ${fieldErrors.date ? 'border-destructive' : ''}`}
                />
                {fieldErrors.date && <p className="text-sm text-destructive mt-1">{fieldErrors.date}</p>}
              </div>

              {/* ── Comment ── */}
              <div>
                <Label>Comment <span className="text-destructive">*</span></Label>
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
            </div>
          </div>

          {/* ── Asset ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Asset</h3>
            <Separator className="mb-4" />
            <div>
              <Label>Asset <span className="text-destructive">*</span></Label>
              <Select value={assetId} onValueChange={(val) => { setAssetId(val); clearFieldError('assetId'); }}>
                <SelectTrigger className={`mt-1.5 ${fieldErrors.assetId ? 'border-destructive' : ''}`}>
                  <SelectValue placeholder="Select asset" />
                </SelectTrigger>
                <SelectContent>
                  {assets.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No data yet</div>
                  ) : (
                    assets.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {fieldErrors.assetId && <p className="text-sm text-destructive mt-1">{fieldErrors.assetId}</p>}
            </div>
          </div>

          {/* ── Operator ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Operator</h3>
            <Separator className="mb-4" />
            <div>
              <Label>Operator</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select operator (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No data yet</div>
                  ) : (
                    drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Priority & Severity ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Classification</h3>
            <Separator className="mb-4" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Priority <span className="text-destructive">*</span></Label>
                <Select value={priority} onValueChange={(val) => { setPriority(val); clearFieldError('priority'); }}>
                  <SelectTrigger className={`mt-1.5 ${fieldErrors.priority ? 'border-destructive' : ''}`}>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                {fieldErrors.priority && <p className="text-sm text-destructive mt-1">{fieldErrors.priority}</p>}
              </div>
              <div>
                <Label>Severity <span className="text-destructive">*</span></Label>
                <Select value={severity} onValueChange={(val) => { setSeverity(val); clearFieldError('severity'); }}>
                  <SelectTrigger className={`mt-1.5 ${fieldErrors.severity ? 'border-destructive' : ''}`}>
                    <SelectValue placeholder="Select severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="non_critical">Non-Critical</SelectItem>
                  </SelectContent>
                </Select>
                {fieldErrors.severity && <p className="text-sm text-destructive mt-1">{fieldErrors.severity}</p>}
              </div>
            </div>
          </div>

          {/* ── Status (edit mode) ── */}
          {mode === 'edit' && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Status</h3>
              <Separator className="mb-4" />
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="corrected">Corrected</SelectItem>
                    <SelectItem value="no_correction_needed">No Correction Needed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ── Attachments ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Attachments</h3>
            <Separator className="mb-4" />
            <AttachmentUploader
              files={attachments}
              onChange={setAttachments}
              accept=".doc,.docx,.pdf,.csv,.xls,.xlsx,.jpg,.jpeg,.png,.heic"
              hint="Supported: DOC, PDF, CSV, XLS, JPG, HEIC or PNG — Max 50 MB per file"
              emptyText="No attachments uploaded."
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
