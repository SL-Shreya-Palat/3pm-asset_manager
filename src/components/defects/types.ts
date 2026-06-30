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
  attachments: DefectAttachmentRow[];
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
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

export const PRIORITY_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'secondary',
};

export const PRIORITY_DISPLAY_NAME: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const SEVERITY_DISPLAY_NAME: Record<string, string> = {
  critical: 'Critical',
  non_critical: 'Non-Critical',
};
