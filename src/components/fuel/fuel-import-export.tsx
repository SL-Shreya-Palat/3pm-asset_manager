'use client';

/**
 * Fuel Import/Export dropdown — adapted from dispatch portal's ImportExportButtons.
 *
 * Provides: Import from Excel (two-phase), Download Template, Export as Excel/CSV.
 * Uses the FuelImportIssuesModal for validation errors with "proceed with valid only".
 */
import { useRef, useState } from 'react';
import {
  FileSpreadsheet,
  FileDown,
  ArrowDownToLine,
  ChevronDown,
  Loader2,
  Sparkles,
} from 'lucide-react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FuelImportIssuesModal } from './fuel-import-issues-modal';
import { FuelAiImportDialog } from './fuel-ai-import-dialog';
import type { ImportResult } from '@/lib/data-io/types';

/** Trigger a browser download from an API endpoint. */
async function downloadFile(url: string, filename: string) {
  const res = await axios.get(url, { responseType: 'blob', withCredentials: true });
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export function FuelImportExport({
  onImported,
  onImportResult,
}: {
  /** Called after a successful import to refresh the list + analytics. */
  onImported: () => void;
  /** Called with the import result so the parent can display the success dialog. */
  onImportResult: (result: ImportResult) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingFile = useRef<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [issueResult, setIssueResult] = useState<ImportResult | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [aiImportOpen, setAiImportOpen] = useState(false);

  /** Send file to import API with optional proceedValidOnly flag. */
  async function sendImport(file: File, proceedValidOnly: boolean): Promise<ImportResult> {
    const fd = new FormData();
    fd.append('file', file);
    if (proceedValidOnly) fd.append('proceedValidOnly', 'true');
    const res = await axios.post('/api/fuel/import', fd, {
      withCredentials: true,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data as ImportResult;
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    pendingFile.current = file;
    setBusy(true);
    try {
      const r = await sendImport(file, false);
      if (r.errors.length > 0 && r.success === 0) {
        // Phase 1 blocked: show issues modal with "proceed with valid only".
        setIssueResult(r);
        setIssuesOpen(true);
      } else {
        // Clean import (or partial success if errors exist but some succeeded).
        onImportResult(r);
        if (r.success > 0) onImported();
      }
    } catch (err) {
      const message = axios.isAxiosError(err) && err.response?.data?.error
        ? String(err.response.data.error)
        : 'Failed to import file';
      onImportResult({
        totalRows: 0,
        success: 0,
        failed: 0,
        readyRows: 0,
        errors: [{ row: 0, errors: [message] }],
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleProceedValid() {
    if (!pendingFile.current) return;
    setBusy(true);
    try {
      const r = await sendImport(pendingFile.current, true);
      setIssuesOpen(false);
      onImportResult(r);
      if (r.success > 0) onImported();
    } catch (err) {
      const message = axios.isAxiosError(err) && err.response?.data?.error
        ? String(err.response.data.error)
        : 'Failed to import file';
      onImportResult({
        totalRows: 0,
        success: 0,
        failed: 0,
        readyRows: 0,
        errors: [{ row: 0, errors: [message] }],
      });
      setIssuesOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(url: string, filename: string) {
    setBusy(true);
    try {
      await downloadFile(url, filename);
    } catch {
      // Download errors are non-critical; the browser typically shows its own error.
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={onFileChosen}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Import/Export
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setAiImportOpen(true)}>
            <Sparkles className="h-4 w-4 text-violet-500" />
            Import with AI
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileRef.current?.click()}>
            <FileDown className="h-4 w-4 text-red-500" />
            Import from Excel
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleDownload('/api/fuel/template', 'fuel-template.xlsx')}
          >
            <FileSpreadsheet className="h-4 w-4 text-blue-500" />
            Download Template
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => handleDownload('/api/fuel/export?format=xlsx', 'fuel-transactions.xlsx')}
          >
            <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
            Export as Excel
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleDownload('/api/fuel/export?format=csv', 'fuel-transactions.csv')}
          >
            <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
            Export as CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FuelImportIssuesModal
        open={issuesOpen}
        onOpenChange={setIssuesOpen}
        result={issueResult}
        busy={busy}
        onProceed={handleProceedValid}
      />

      <FuelAiImportDialog
        open={aiImportOpen}
        onOpenChange={setAiImportOpen}
        onImported={onImported}
      />
    </>
  );
}
