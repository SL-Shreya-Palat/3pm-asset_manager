export interface FaultAttachmentRow {
  url: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export interface FaultRow {
  id: string;
  faultNumber: string;
  title: string;
  description: string;
  reportedAt: string;
  assetId: string;
  assetName: string;
  reportedByType: string;
  reportedById: string;
  reportedByName: string;
  category: string;
  priority: string;
  severity: string;
  status: string;
  meterType: string | null;
  meterReading: number | null;
  takeOutOfService: boolean;
  workOrderId: string | null;
  workOrderNumber: string | null;
  attachments: FaultAttachmentRow[];
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

export const FAULT_STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'wont_fix', label: "Won't Fix" },
] as const;

export const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  open: 'warning',
  in_progress: 'default',
  resolved: 'success',
  wont_fix: 'outline',
};

export const STATUS_DISPLAY_NAME: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  wont_fix: "Won't Fix",
};

export const PRIORITY_BADGE_CLASSES: Record<string, string> = {
  high: 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
};

export const PRIORITY_DISPLAY_NAME: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const CATEGORY_DISPLAY_NAME: Record<string, string> = {
  mechanical: 'Mechanical',
  electrical: 'Electrical',
  hydraulic: 'Hydraulic',
  body: 'Body',
  tyres: 'Tyres',
  safety: 'Safety',
  other: 'Other',
};

export const SEVERITY_DISPLAY_NAME: Record<string, string> = {
  critical: 'Critical',
  non_critical: 'Non-Critical',
};
