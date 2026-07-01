export interface POLineItemRow {
  partId: string;
  quantity: number;
  unitCost: number;
  total: number;
  /** Units received into stock so far (0 until received). */
  receivedQuantity?: number;
}

export interface PODocumentRow {
  url: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export interface POStatusHistoryRow {
  from: string | null;
  to: string;
  changedBy: string;
  changedAt: string;
  note?: string;
}

export interface PurchaseOrderRow {
  id: string;
  poNumber: string;
  status: string;
  vendorId: string;
  vendorName: string;
  deliveryLocationId: string;
  approverId: string;
  lineItems: POLineItemRow[];
  subTotal: number;
  shipping: number;
  taxType: string;
  taxValue: number;
  total: number;
  description?: string;
  documents: PODocumentRow[];
  statusHistory: POStatusHistoryRow[];
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason?: string;
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

export const PO_STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_approval', label: 'Pending Approval' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'approved', label: 'Approved' },
  { key: 'purchased', label: 'Purchased' },
  { key: 'received', label: 'Received' },
  { key: 'received_partial', label: 'Received Partial' },
  { key: 'closed', label: 'Closed' },
] as const;

export const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  draft: 'secondary',
  pending_approval: 'warning',
  rejected: 'destructive',
  approved: 'success',
  purchased: 'default',
  received: 'success',
  received_partial: 'warning',
  closed: 'outline',
};

export const STATUS_DISPLAY_NAME: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  rejected: 'Rejected',
  approved: 'Approved',
  purchased: 'Purchased',
  received: 'Received',
  received_partial: 'Received Partial',
  closed: 'Closed',
};
