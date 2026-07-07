'use client';

/**
 * Import validation issues modal — adapted from dispatch portal's ImportIssuesModal.
 *
 * Shows per-row validation errors from a blocked import (phase 1) and offers
 * the user the option to import only the rows that passed validation.
 */
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ImportResult } from '@/lib/data-io/types';

export function FuelImportIssuesModal({
  open,
  onOpenChange,
  result,
  busy,
  onProceed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: ImportResult | null;
  busy: boolean;
  onProceed: () => void;
}) {
  if (!result) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-2 px-6 pb-4 pt-6 text-left">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Some rows need attention
          </DialogTitle>
          <DialogDescription>
            Fix these rows in your file and re-import, or import only the valid rows now.
          </DialogDescription>
        </DialogHeader>

        {/* Summary badges */}
        <div className="flex gap-3 px-6 pb-3 text-sm">
          <span className="rounded-sm border bg-card px-3 py-1.5">
            <b className="tabular-nums">{result.totalRows}</b> rows
          </span>
          <span className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
            <b className="tabular-nums">{result.readyRows}</b> valid
          </span>
          <span className="rounded-sm border border-red-200 bg-red-50 px-3 py-1.5 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            <b className="tabular-nums">{result.errors.length}</b> with issues
          </span>
        </div>

        {/* Scrollable error list */}
        <div className="min-h-0 flex-1 overflow-y-auto border-t px-6 py-3">
          <ul className="space-y-2 text-sm">
            {result.errors.map((e, i) => (
              <li key={`${e.row}-${i}`} className="rounded-sm border bg-muted/20 p-2.5">
                <span className="font-medium">Row {e.row}</span>
                <ul className="mt-1 list-inside list-disc text-xs text-destructive">
                  {e.errors.map((msg, j) => (
                    <li key={j}>{msg}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <DialogFooter className="border-t px-6 py-4 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onProceed} disabled={busy || result.readyRows === 0}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Import {result.readyRows} valid {result.readyRows === 1 ? 'row' : 'rows'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
