export interface DefectAttachmentRow {
  url: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export interface DefectRow {
  id: string;
  defectNumber: string;
  name: string;
  date: string;
  comment: string;
  assetId: string;
  assetName: string;
  driverId: string | null;
  driverName: string | null;
  priority: string;
  severity: string;
  status: string;
  workOrderId: string | null;
  workOrderNumber: string | null;
  source: string;
  attachments: DefectAttachmentRow[];
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  createdBy: string | null;
}

export interface LookupOption {
  id: string;
  name: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export const DEFECT_STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'corrected', label: 'Corrected' },
  { key: 'no_correction_needed', label: 'No Correction Needed' },
] as const;

export const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  new: 'warning',
  in_progress: 'default',
  corrected: 'success',
  no_correction_needed: 'outline',
};

export const STATUS_DISPLAY_NAME: Record<string, string> = {
  new: 'New',
  in_progress: 'In Progress',
  corrected: 'Corrected',
  no_correction_needed: 'No Correction Needed',
};

/** Severity badge — styled as subtle colored pills matching row-action tones. */
export const SEVERITY_BADGE_CLASSES: Record<string, string> = {
  high: 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
};

export const SEVERITY_DISPLAY_NAME: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
