export interface WOAttachmentRow {
  url: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export interface WOStatusHistoryRow {
  fromStatusId: string | null;
  fromStatusLabel: string | null;
  toStatusId: string;
  toStatusLabel: string;
  changedBy: string;
  /** Resolved display name of the user who made the change (detail view). */
  changedByName?: string;
  changedAt: string;
}

export interface WOPartRow {
  partId: string;
  partName: string;
  partNumber: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface WorkOrderRow {
  id: string;
  workOrderNumber: string;
  assetId: string;
  assetName: string;
  serviceTaskIds: string[];
  /** Resolved service-task names keyed by task id (detail view). */
  serviceTaskNames?: Record<string, string>;
  source?: string;
  defectIds?: string[];
  faultIds?: string[];
  parts?: WOPartRow[];
  partsCost?: number;
  isCompleted?: boolean;
  completedAt?: string | null;
  assigneeType: string;
  assigneeId: string | null;
  assigneeName: string;
  assigneeContact?: string;
  assigneeEmail?: string;
  assigneePhone?: string;
  thirdPartyName?: string;
  thirdPartyEmail?: string;
  statusId: string;
  statusLabel: string;
  dueDate: string | null;
  description?: string;
  attachments: WOAttachmentRow[];
  statusHistory: WOStatusHistoryRow[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
}

export interface WOStatusOption {
  id: string;
  label: string;
  color: string;
  type: string;
  sequence: number;
}

export interface LookupOption {
  id: string;
  name: string;
}

export interface VendorLookup {
  id: string;
  name: string;
  contactName: string;
  email?: string;
  phone?: string;
}

export interface UserLookup {
  id: string;
  name: string;
  email?: string;
  phoneNumber?: string;
}

export interface PartLookup {
  id: string;
  name: string;
  partNumber: string;
  unitCost: number;
  stock: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
