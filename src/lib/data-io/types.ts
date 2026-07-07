/**
 * Import/Export types adapted from the dispatch portal's data-io system.
 * Simplified for the asset-manager — no registry, no lookup refs, no Zod binding.
 */

/** Errors for a single spreadsheet row (1-based, matching the sheet). */
export interface RowError {
  row: number;
  errors: string[];
}

/** Outcome returned to the client after an import attempt. */
export interface ImportResult {
  totalRows: number;
  /** Rows inserted. */
  success: number;
  /** Rows that failed validation or insertion. */
  failed: number;
  /** Rows that passed validation (insertable). */
  readyRows: number;
  errors: RowError[];
}

/** Preview returned by the AI import endpoint (no rows inserted yet). */
export interface AiFuelImportPreview {
  /** Whether the AI determined the document contains fuel transaction data. */
  matchesModule: boolean;
  /** Short label describing the document type (e.g. "fuel receipt"). */
  detectedType: string;
  /** AI confidence in the extraction, 0–1. */
  confidence: number;
  /** Template column headers in canonical order. */
  headers: string[];
  /** Extracted rows keyed by header name (all string values). */
  rows: Record<string, string>[];
  /** Dry-run validation result, null when matchesModule is false. */
  validation: {
    totalRows: number;
    readyRows: number;
    errors: RowError[];
  } | null;
}
