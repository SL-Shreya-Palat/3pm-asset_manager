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
  changedAt: string;
}

export interface WorkOrderRow {
  id: string;
  workOrderNumber: string;
  assetId: string;
  assetName: string;
  serviceTaskIds: string[];
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
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
}

export interface WOStatusOption {
  id: string;
  label: string;
  color: string;
  approvalRequired: boolean;
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

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
