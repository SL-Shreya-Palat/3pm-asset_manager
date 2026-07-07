'use client';

/**
 * AI document import dialog for fuel transactions.
 *
 * Three-step flow:
 *   1. Pick — drag-and-drop zone for PDF/image upload
 *   2. Extracting — spinner while the AI reads the document
 *   3. Preview — editable table of extracted rows with validation
 *
 * Adapted from the dispatch portal's AiImportDialog, simplified for the
 * asset-manager (no toast library, fuel-only, inline errors).
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  AI_IMPORT_ACCEPT,
  AI_IMPORT_MAX_BYTES,
  resolveAiMediaType,
} from '@/lib/data-io/ai-import';
import type { AiFuelImportPreview, ImportResult, RowError } from '@/lib/data-io/types';

type Step = 'pick' | 'extracting' | 'preview';

/** Per-row state in the preview table. */
interface PreviewRow {
  values: Record<string, string>;
  errors: string[];
  /** Row was edited after the last validation, so its errors may be stale. */
  edited: boolean;
}

/** Map server row errors (sheet rows start at 2) onto preview rows. */
function applyErrors(rows: PreviewRow[], errors: RowError[]): PreviewRow[] {
  const byIndex = new Map(errors.map((e) => [e.row - 2, e.errors]));
  return rows.map((r, i) => ({ ...r, errors: byIndex.get(i) ?? [], edited: false }));
}

export function FuelAiImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful import to refresh the list + analytics. */
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('pick');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<AiFuelImportPreview | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (open) {
      setStep('pick');
      setDragOver(false);
      setFileName('');
      setPreview(null);
      setRows([]);
      setImporting(false);
      setError('');
    }
  }, [open]);

  const busy = step === 'extracting' || importing;

  const handleFile = useCallback(async (file: File) => {
    setError('');
    if (!resolveAiMediaType(file.name, file.type)) {
      setError('Unsupported file type. Upload a PDF, PNG, JPG or WebP.');
      return;
    }
    if (file.size > AI_IMPORT_MAX_BYTES) {
      setError('File is too large — the limit is 10 MB.');
      return;
    }

    setFileName(file.name);
    setStep('extracting');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/fuel/ai-import', { method: 'POST', body: fd, credentials: 'include' });
      const { data, error: apiError } = await res.json();
      if (apiError) throw new Error(apiError);
      const p = data as AiFuelImportPreview;
      setPreview(p);
      setRows(
        applyErrors(
          p.rows.map((values) => ({ values, errors: [], edited: false })),
          p.validation?.errors ?? [],
        ),
      );
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
      setStep('pick');
    }
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !busy) void handleFile(file);
  }

  function updateCell(rowIdx: number, header: string, value: string) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === rowIdx ? { ...r, values: { ...r.values, [header]: value }, edited: true } : r,
      ),
    );
  }

  function removeRow(rowIdx: number) {
    setRows((prev) => prev.filter((_, i) => i !== rowIdx));
  }

  async function runImport(proceedValidOnly: boolean) {
    if (!rows.length) return;
    setImporting(true);
    try {
      const res = await fetch('/api/fuel/import-rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rows: rows.map((r) => r.values), proceedValidOnly }),
      });
      const { data, error: apiError } = await res.json();
      if (apiError) throw new Error(apiError);
      const result = data as ImportResult;

      if (result.success > 0) {
        onImported();
        onOpenChange(false);
        return;
      }
      // Phase-1 gate: nothing inserted — surface the issues on the rows.
      setRows((prev) => applyErrors(prev, result.errors));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  const errorCount = rows.filter((r) => r.errors.length && !r.edited).length;
  const validCount = rows.length - errorCount;
  const confidencePct = preview ? Math.round(preview.confidence * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        className={cn(
          'flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0',
          step === 'preview' && preview?.matchesModule ? 'sm:max-w-4xl' : 'sm:max-w-lg',
        )}
      >
        <DialogHeader className="space-y-2 px-6 pb-4 pt-6 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Import Fuel Transactions with AI
          </DialogTitle>
          <DialogDescription>
            Upload a document — a PDF or photo — and the AI will read it and fill the fuel
            transaction template for you. You review everything before anything is saved.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step: pick a file ── */}
        {step === 'pick' && (
          <div className="px-6 pb-6">
            <input
              ref={fileRef}
              type="file"
              accept={AI_IMPORT_ACCEPT}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void handleFile(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors',
                dragOver
                  ? 'border-primary/60 bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/40',
              )}
            >
              <div className="rounded-full bg-primary/10 p-3">
                <UploadCloud className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Drop a file here, or click to browse</p>
                <p className="text-xs text-muted-foreground">
                  PDF, PNG, JPG or WebP — up to 10 MB. Fuel receipts, fleet fuel reports, fuel
                  card statements, bulk delivery tickets…
                </p>
              </div>
            </button>
            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        {/* ── Step: extracting ── */}
        {step === 'extracting' && (
          <div className="flex flex-col items-center gap-5 px-6 py-14">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-5 w-5 animate-pulse text-primary" />
              </div>
            </div>
            <div className="space-y-1 text-center">
              <p className="text-sm font-medium">Reading your document…</p>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                {fileName}
              </p>
            </div>
          </div>
        )}

        {/* ── Step: preview — document didn't match ── */}
        {step === 'preview' && preview && !preview.matchesModule && (
          <div className="px-6 pb-6">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-amber-900">
                  This doesn&apos;t look like fuel transaction data
                </p>
                <p className="text-amber-800">
                  The AI read the file as{' '}
                  <span className="font-medium">
                    {preview.detectedType || 'an unrelated document'}
                  </span>{' '}
                  and found no fuel transactions to import.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setStep('pick')}>
                Try another file
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: preview — editable extracted rows ── */}
        {step === 'preview' && preview && preview.matchesModule && (
          <>
            <div className="flex flex-wrap items-center gap-2 px-6 pb-3 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-sm border bg-card px-3 py-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Detected: <b className="capitalize">{preview.detectedType}</b>
                <span className="text-muted-foreground">· {confidencePct}% confident</span>
              </span>
              <span className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-700">
                <b className="tabular-nums">{validCount}</b> ready
              </span>
              {errorCount > 0 && (
                <span className="rounded-sm border border-red-200 bg-red-50 px-3 py-1.5 text-red-700">
                  <b className="tabular-nums">{errorCount}</b> with issues
                </span>
              )}
            </div>

            {error && (
              <div className="mx-6 mb-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col border-t px-6 py-4">
              <div className="min-h-0 overflow-auto rounded-md border">
                <table className="w-full min-w-max text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                    <tr>
                      <th className="w-10 py-2 pl-4 pr-3" />
                      {preview.headers.map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                        >
                          {h}
                        </th>
                      ))}
                      <th className="w-12 py-2 pl-2 pr-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const hasError = row.errors.length > 0 && !row.edited;
                      return (
                        <Fragment key={i}>
                          <tr className={cn('border-t', hasError && 'bg-red-50/60')}>
                            <td className="py-1.5 pl-4 pr-3 text-center">
                              {hasError ? (
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              )}
                            </td>
                            {preview.headers.map((h) => (
                              <td key={h} className="px-2 py-1.5">
                                <Input
                                  value={row.values[h] ?? ''}
                                  onChange={(e) => updateCell(i, h, e.target.value)}
                                  className="h-8 min-w-32 border-transparent bg-transparent text-sm shadow-none hover:border-input focus-visible:border-input"
                                  disabled={importing}
                                />
                              </td>
                            ))}
                            <td className="py-1.5 pl-2 pr-4">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => removeRow(i)}
                                disabled={importing}
                                aria-label="Remove row"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                          {hasError && (
                            <tr className="bg-red-50/60">
                              <td />
                              <td
                                colSpan={preview.headers.length + 1}
                                className="pb-2 pl-3 pr-4 text-xs text-destructive"
                              >
                                {row.errors.join(' · ')}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr className="border-t">
                        <td
                          colSpan={preview.headers.length + 2}
                          className="px-6 py-8 text-center text-sm text-muted-foreground"
                        >
                          All rows removed — upload another file or cancel.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter className="gap-2 border-t px-6 py-4 sm:justify-between">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
                Cancel
              </Button>
              <div className="flex gap-2">
                {errorCount > 0 && validCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => void runImport(true)}
                    disabled={importing}
                  >
                    Import {validCount} valid only
                  </Button>
                )}
                <Button
                  onClick={() => void runImport(false)}
                  disabled={importing || rows.length === 0}
                >
                  {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Import {rows.length} {rows.length === 1 ? 'row' : 'rows'}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
