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
