'use client';

/**
 * Asset Compliance tab — the vehicle's rego / WOF / COF / RUC / insurance and
 * other expiring documents. Each cert is a `documents` record (scope 'asset');
 * status ("Valid / Expiring soon / Expired") is derived server-side from the
 * expiry date. Mirrors the Meter/Fuel tab pattern; adds a one-tap Renew.
 */
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  ShieldCheck, ShieldAlert, CircleCheck, Plus, Pencil, Trash2, RefreshCw, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { DateField } from '@/components/ui/date-field';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AttachmentUploader, type UploadedFile } from '@/components/ui/attachment-uploader';
import {
  ASSET_DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_STATUS_CONFIG,
  DEFAULT_REMINDER_DAYS,
  type DocumentStatus,
} from '@/constants/documents';

interface Doc {
  id: string;
  docType: string;
  title: string;
  fileUrl?: string;
  fileName?: string;
  expiryDate?: string | null;
  reminderDays: number;
  notes?: string;
  status: DocumentStatus;
  daysUntilExpiry: number | null;
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Human "Expires in N days" / "Expired N days ago" line. */
function expiryText(doc: Doc): string {
  if (doc.daysUntilExpiry == null) return 'No expiry date';
  const d = doc.daysUntilExpiry;
  if (d < 0) return `Expired ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago`;
  if (d === 0) return 'Expires today';
  return `Expires in ${d} day${d === 1 ? '' : 's'}`;
}

type DialogMode = 'add' | 'edit' | 'renew';

export function AssetComplianceTab({ assetId }: { assetId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ mode: DialogMode; doc?: Doc } | null>(null);
  const [deleting, setDeleting] = useState<Doc | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/documents?scope=asset&assetId=${assetId}`, { withCredentials: true });
      setDocs(res.data.data?.items ?? []);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    const t = setTimeout(() => fetchDocs(), 0);
    return () => clearTimeout(t);
  }, [fetchDocs]);

  const handleSaved = () => { setDialog(null); fetchDocs(); };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await axios.delete(`/api/documents/${deleting.id}`, { withCredentials: true });
      setDeleting(null);
      fetchDocs();
    } catch {
      /* leave dialog open on failure */
    } finally {
      setDeleteBusy(false);
    }
  };

  const expiringCount = docs.filter((d) => d.status === 'expiring_soon').length;
  const expiredCount = docs.filter((d) => d.status === 'expired').length;
  const validCount = docs.filter((d) => d.status === 'valid').length;

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div>
      {/* Compliance summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={<CircleCheck className="h-4 w-4" />}
          label="Valid"
          value={String(validCount)}
          accent={validCount > 0 ? 'text-emerald-600' : undefined}
        />
        <StatCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Expiring soon"
          value={String(expiringCount)}
          accent={expiringCount > 0 ? 'text-amber-600' : undefined}
          hint={expiringCount > 0 ? 'renew before they lapse' : undefined}
        />
        <StatCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Expired"
          value={String(expiredCount)}
          accent={expiredCount > 0 ? 'text-red-600' : undefined}
          hint={expiredCount > 0 ? 'vehicle may be non-compliant' : undefined}
        />
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground">
          Compliance Documents
          <span className="text-muted-foreground font-normal ml-2">({docs.length})</span>
        </h3>
        <Button size="sm" onClick={() => setDialog({ mode: 'add' })}>
          <Plus className="h-4 w-4" /> Add Document
        </Button>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center">
          <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground mt-2">
            No compliance documents yet. Add the vehicle&apos;s Rego, WOF/COF, RUC or insurance to track expiry.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {docs.map((d) => {
            const cfg = DOCUMENT_STATUS_CONFIG[d.status];
            return (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">
                      {DOCUMENT_TYPE_LABELS[d.docType] || d.title}
                    </span>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {expiryText(d)}
                    {d.expiryDate ? ` · ${formatDate(d.expiryDate)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {d.fileUrl && (
                    <Button variant="ghost" size="icon-sm" asChild title="View file">
                      <a href={d.fileUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Renew"
                    onClick={() => setDialog({ mode: 'renew', doc: d })}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Edit"
                    onClick={() => setDialog({ mode: 'edit', doc: d })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Delete"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleting(d)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialog && (
        <DocumentDialog
          assetId={assetId}
          mode={dialog.mode}
          doc={dialog.doc}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      )}

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              This removes &quot;{deleting ? (DOCUMENT_TYPE_LABELS[deleting.docType] || deleting.title) : ''}&quot;
              from this asset&apos;s compliance list. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentDialog({
  assetId, mode, doc, onClose, onSaved,
}: {
  assetId: string;
  mode: DialogMode;
  doc?: Doc;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isRenew = mode === 'renew';
  const [docType, setDocType] = useState(doc?.docType || 'registration');
  // On renew, start the expiry blank (they're entering the new one).
  const [expiryDate, setExpiryDate] = useState(!isRenew && doc?.expiryDate ? doc.expiryDate.slice(0, 10) : '');
  const [reminderDays, setReminderDays] = useState(String(doc?.reminderDays ?? DEFAULT_REMINDER_DAYS));
  const [notes, setNotes] = useState(doc?.notes || '');
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const existingFileName = doc?.fileName || (doc?.fileUrl ? 'Current file' : '');

  const heading = isRenew ? 'Renew Document' : mode === 'edit' ? 'Edit Document' : 'Add Document';
  const description = isRenew
    ? 'Enter the new expiry date and attach the new certificate. The rest is carried over.'
    : 'Track a compliance document (Rego, WOF/COF, RUC, insurance…) and its expiry.';

  const handleSubmit = async () => {
    setError('');
    if (reminderDays && (Number(reminderDays) < 0 || Number(reminderDays) > 365)) {
      setError('Reminder lead time must be between 0 and 365 days');
      return;
    }
    // Keep the existing file unless a new one was uploaded (edit/renew).
    const fileUrl = file?.url ?? doc?.fileUrl;
    const fileName = file?.originalName ?? doc?.fileName;

    const payload: Record<string, unknown> = {
      docType,
      expiryDate: expiryDate || undefined,
      reminderDays: reminderDays ? Number(reminderDays) : undefined,
      notes: notes.trim() || undefined,
      fileUrl,
      fileName,
    };

    try {
      setSaving(true);
      if (mode === 'add') {
        await axios.post('/api/documents', { scope: 'asset', assetId, ...payload }, { withCredentials: true });
      } else if (doc) {
        await axios.put(`/api/documents/${doc.id}`, payload, { withCredentials: true });
      }
      onSaved();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error && typeof err.response.data.error === 'object') {
        const first = Object.values(err.response.data.error)[0];
        setError(typeof first === 'string' ? first : 'Failed to save document');
      } else {
        setError('Failed to save document');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Document type</Label>
              <Select value={docType} onValueChange={setDocType} disabled={isRenew}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="docReminder">Remind me (days before)</Label>
              <Input id="docReminder" type="number" min="0" max="365" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} className="mt-1.5" />
            </div>
          </div>

          <DateField id="docExpiry" label="Expiry date" value={expiryDate} onChange={setExpiryDate} placeholder="Select date" />

          <div>
            <Label className="mb-1.5 block">Certificate file</Label>
            {existingFileName && !file && (
              <p className="text-xs text-muted-foreground mb-2">
                Current: {doc?.fileUrl
                  ? <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{existingFileName}</a>
                  : existingFileName}
                {isRenew ? ' — upload the new one below to replace it.' : ''}
              </p>
            )}
            <AttachmentUploader
              files={file ? [file] : []}
              onChange={(files) => setFile(files[files.length - 1] ?? null)}
              multiple={false}
              accept=".pdf,.jpg,.jpeg,.png,.heic,image/*,application/pdf"
              hint="PDF, JPG, PNG or HEIC · max 50 MB"
              emptyText="No file attached."
              onError={setError}
            />
          </div>

          {!isRenew && (
            <div>
              <Label htmlFor="docNotes">Notes</Label>
              <Textarea id="docNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="mt-1.5" rows={2} />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : isRenew ? 'Renew' : mode === 'edit' ? 'Save' : 'Add Document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
