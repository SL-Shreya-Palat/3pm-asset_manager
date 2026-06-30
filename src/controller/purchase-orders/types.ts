import { ObjectId } from 'mongodb';

export const PO_STATUSES = [
  'draft',
  'pending_approval',
  'rejected',
  'approved',
  'purchased',
  'received',
  'received_partial',
  'closed',
] as const;

export type POStatus = (typeof PO_STATUSES)[number];

export const TAX_TYPES = ['percentage', 'fixed'] as const;
export type TaxType = (typeof TAX_TYPES)[number];

/** Embedded line item on a PO. */
export interface POLineItem {
  partId: ObjectId;
  quantity: number;
  unitCost: number;
  total: number;
}

/** Embedded document attachment. */
export interface PODocument {
  url: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
}

/** Status history entry. */
export interface POStatusEntry {
  from: POStatus | null;
  to: POStatus;
  changedBy: ObjectId;
  changedAt: Date;
  note?: string;
}

/** Stored purchase order document. */
export interface PurchaseOrder {
  _id: ObjectId;
  tenantId: ObjectId;
  poNumber: string;
  status: POStatus;
  vendorId: ObjectId;
  vendorName: string;
  deliveryLocationId: ObjectId;
  approverId: ObjectId;
  lineItems: POLineItem[];
  subTotal: number;
  shipping: number;
  taxType: TaxType;
  taxValue: number;
  total: number;
  description?: string;
  documents: PODocument[];
  statusHistory: POStatusEntry[];
  approvedAt?: Date | null;
  approvedBy?: ObjectId | null;
  rejectedAt?: Date | null;
  rejectedBy?: ObjectId | null;
  rejectionReason?: string;
  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  isArchived: boolean;
  archivedAt?: Date | null;
  archivedBy?: ObjectId | null;
}

/** Input for creating a PO. */
export interface CreatePurchaseOrderInput {
  vendorId: string;
  deliveryLocationId: string;
  approverId: string;
  lineItems: Array<{ partId: string; quantity: number; unitCost: number }>;
  shipping?: number;
  taxType?: string;
  taxValue?: number;
  description?: string;
  documents?: Array<{
    url: string;
    filename: string;
    originalName: string;
    contentType: string;
    size: number;
  }>;
  status?: string;
}

/** Input for updating a PO. */
export type UpdatePurchaseOrderInput = Partial<CreatePurchaseOrderInput>;
