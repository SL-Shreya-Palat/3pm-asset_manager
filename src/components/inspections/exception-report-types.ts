/**
 * Shared types for the calendar-grid Exception Report.
 *
 * The grid is computed ON THE FLY from inspection submissions — there is no
 * stored per-day status collection. The API returns only the cells that are
 * backed by a real submission ("inspected"/"exception"); every other cell's
 * status (missed / due / upcoming) is derived on the client from the day vs.
 * today, which keeps the payload small.
 */

/** A cell whose status is backed by a real inspection submission. */
export type SubmissionCellStatus = 'inspected' | 'exception';

/** All statuses a rendered cell can take (derived + submission-backed). */
export type CellStatus = SubmissionCellStatus | 'missed' | 'due' | 'upcoming';

/** One submission-backed cell (keyed by day within a form row). */
export interface ExceptionCell {
  status: SubmissionCellStatus;
  /** Number of submissions that landed on this asset/form/day. */
  count: number;
  /** Total defects raised across those submissions. */
  defectCount: number;
  /** Most-recent submission id for that day (opens the detail dialog). */
  submissionId: string;
  inspectionNumber: string | null;
}

export interface ExceptionFormRow {
  formId: string;
  formTitle: string;
  /** Only submission-backed days appear here; keys are `yyyy-MM-dd`. */
  cells: Record<string, ExceptionCell>;
}

export interface ExceptionAssetRow {
  assetId: string;
  assetName: string;
  assetNumber: string | null;
  forms: ExceptionFormRow[];
}

export interface ExceptionReportData {
  from: string; // yyyy-MM-dd
  to: string; // yyyy-MM-dd
  /** Ordered `yyyy-MM-dd` day columns spanning [from, to]. */
  days: string[];
  /** The user's "today" in their timezone — used to highlight the column. */
  today: string;
  assets: ExceptionAssetRow[];
  meta: {
    assetCount: number;
    formCount: number;
    /** True when the asset list was capped — surfaced in the UI, never silent. */
    truncated: boolean;
    assetCap: number;
  };
}
