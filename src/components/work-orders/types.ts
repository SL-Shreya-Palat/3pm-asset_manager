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

export interface WOPartRow {
  /** Local part id; null for lines resolved directly from Command stock. */
  partId: string | null;
  partName: string;
  partNumber: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  /** 'command' when the line consumes Command's ledger, else 'local'. */
  source?: string;
  commandStockId?: string | null;
  /** True once the RECEIPTED_OUT was applied in Command — the line is frozen. */
  pushedToCommand?: boolean;
}

export interface WorkOrderRow {
  id: string;
  workOrderNumber: string;
  assetId: string;
  assetName: string;
  serviceTaskIds: string[];
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
  /** 'command' for Command-imported stock (cost comes from commandUnitCost). */
  source?: string;
  commandStockId?: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
