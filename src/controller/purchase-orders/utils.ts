import { ObjectId } from 'mongodb';
import type { PurchaseOrder, TaxType, POStatus } from './types';
import { PO_STATUSES, TAX_TYPES } from './types';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

function isValidObjectId(value: string): boolean {
  try {
    ObjectId.createFromHexString(value);
    return true;
  } catch {
    return false;
  }
}

export function validateCreatePOInput(input: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};

  // Vendor
  if (!input.vendorId || typeof input.vendorId !== 'string' || !isValidObjectId(input.vendorId)) {
    errors.vendorId = 'Valid vendor is required';
  }

  // Delivery location
  if (!input.deliveryLocationId || typeof input.deliveryLocationId !== 'string' || !isValidObjectId(input.deliveryLocationId)) {
    errors.deliveryLocationId = 'Valid delivery location is required';
  }

  // Approver
  if (!input.approverId || typeof input.approverId !== 'string' || !isValidObjectId(input.approverId)) {
    errors.approverId = 'Valid approver is required';
  }

  // Line items
  if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) {
    errors.lineItems = 'At least one line item is required';
  } else if (input.lineItems.length > 30) {
    errors.lineItems = 'Maximum 30 line items allowed';
  } else {
    for (let i = 0; i < input.lineItems.length; i++) {
      const item = input.lineItems[i] as Record<string, unknown>;
      if (!item.partId || typeof item.partId !== 'string' || !isValidObjectId(item.partId)) {
        errors[`lineItems.${i}.partId`] = 'Valid part is required';
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        errors[`lineItems.${i}.quantity`] = 'Quantity must be a positive integer';
      }
      if (typeof item.unitCost !== 'number' || item.unitCost < 0) {
        errors[`lineItems.${i}.unitCost`] = 'Unit cost must be non-negative';
      }
    }
  }

  // Shipping
  if (input.shipping !== undefined && input.shipping !== null) {
    if (typeof input.shipping !== 'number' || input.shipping < 0) {
      errors.shipping = 'Shipping must be a non-negative number';
    }
  }

  // Tax type
  if (input.taxType !== undefined && input.taxType !== null) {
    if (!TAX_TYPES.includes(input.taxType as TaxType)) {
      errors.taxType = 'Tax type must be "percentage" or "fixed"';
    }
  }

  // Tax value
  if (input.taxValue !== undefined && input.taxValue !== null) {
    if (typeof input.taxValue !== 'number' || input.taxValue < 0) {
      errors.taxValue = 'Tax value must be non-negative';
    }
    if (input.taxType === 'percentage' && typeof input.taxValue === 'number' && input.taxValue > 100) {
      errors.taxValue = 'Tax percentage must be between 0 and 100';
    }
  }

  // Status
  if (input.status !== undefined && input.status !== null) {
    if (input.status !== 'draft' && input.status !== 'pending_approval') {
      errors.status = 'Status must be "draft" or "pending_approval"';
    }
  }

  // Description
  if (input.description && typeof input.description === 'string' && input.description.length > 2000) {
    errors.description = 'Description must be at most 2000 characters';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validate a PARTIAL update payload with the same money rules as create —
 * the update path must never accept values the create path would reject
 * (negative quantities, non-integer quantities, 5000% tax, ...).
 */
export function validateUpdatePOInput(input: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};

  if (input.vendorId !== undefined) {
    if (typeof input.vendorId !== 'string' || !isValidObjectId(input.vendorId)) {
      errors.vendorId = 'Valid vendor is required';
    }
  }
  if (input.deliveryLocationId !== undefined) {
    if (typeof input.deliveryLocationId !== 'string' || !isValidObjectId(input.deliveryLocationId)) {
      errors.deliveryLocationId = 'Valid delivery location is required';
    }
  }
  if (input.approverId !== undefined) {
    if (typeof input.approverId !== 'string' || !isValidObjectId(input.approverId)) {
      errors.approverId = 'Valid approver is required';
    }
  }

  if (input.lineItems !== undefined) {
    if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) {
      errors.lineItems = 'At least one line item is required';
    } else if (input.lineItems.length > 30) {
      errors.lineItems = 'Maximum 30 line items allowed';
    } else {
      for (let i = 0; i < input.lineItems.length; i++) {
        const item = input.lineItems[i] as Record<string, unknown>;
        if (!item.partId || typeof item.partId !== 'string' || !isValidObjectId(item.partId)) {
          errors[`lineItems.${i}.partId`] = 'Valid part is required';
        }
        if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
          errors[`lineItems.${i}.quantity`] = 'Quantity must be a positive integer';
        }
        if (typeof item.unitCost !== 'number' || !Number.isFinite(item.unitCost) || item.unitCost < 0) {
          errors[`lineItems.${i}.unitCost`] = 'Unit cost must be non-negative';
        }
      }
    }
  }

  if (input.shipping !== undefined && input.shipping !== null) {
    if (typeof input.shipping !== 'number' || !Number.isFinite(input.shipping) || input.shipping < 0) {
      errors.shipping = 'Shipping must be a non-negative number';
    }
  }
  if (input.taxType !== undefined && input.taxType !== null) {
    if (!TAX_TYPES.includes(input.taxType as TaxType)) {
      errors.taxType = 'Tax type must be "percentage" or "fixed"';
    }
  }
  if (input.taxValue !== undefined && input.taxValue !== null) {
    if (typeof input.taxValue !== 'number' || !Number.isFinite(input.taxValue) || input.taxValue < 0) {
      errors.taxValue = 'Tax value must be non-negative';
    }
    if (input.taxType === 'percentage' && typeof input.taxValue === 'number' && input.taxValue > 100) {
      errors.taxValue = 'Tax percentage must be between 0 and 100';
    }
  }
  if (input.description && typeof input.description === 'string' && input.description.length > 2000) {
    errors.description = 'Description must be at most 2000 characters';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// ---------------------------------------------------------------------------
// Cost calculation
// ---------------------------------------------------------------------------

export function calculateCostSummary(
  lineItems: Array<{ quantity: number; unitCost: number }>,
  shipping: number,
  taxType: TaxType,
  taxValue: number,
): { subTotal: number; total: number } {
  const subTotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const taxAmount = taxType === 'percentage'
    ? subTotal * (taxValue / 100)
    : taxValue;
  const total = subTotal + shipping + taxAmount;
  return {
    subTotal: Math.round(subTotal * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializePurchaseOrder(doc: Record<string, unknown>): Record<string, unknown> {
  const po = doc as unknown as PurchaseOrder;
  return {
    id: po._id.toString(),
    poNumber: po.poNumber,
    status: po.status,
    vendorId: po.vendorId.toString(),
    vendorName: po.vendorName || '',
    deliveryLocationId: po.deliveryLocationId.toString(),
    approverId: po.approverId.toString(),
    lineItems: (po.lineItems || []).map((li) => ({
      partId: li.partId.toString(),
      quantity: li.quantity,
      unitCost: li.unitCost,
      total: li.total,
      receivedQuantity: li.receivedQuantity ?? 0,
    })),
    subTotal: po.subTotal,
    shipping: po.shipping,
    taxType: po.taxType,
    taxValue: po.taxValue,
    total: po.total,
    description: po.description || undefined,
    documents: (po.documents || []).map((d) => ({
      url: d.url,
      filename: d.filename,
      originalName: d.originalName,
      contentType: d.contentType,
      size: d.size,
      uploadedAt: d.uploadedAt instanceof Date ? d.uploadedAt.toISOString() : d.uploadedAt,
    })),
    statusHistory: (po.statusHistory || []).map((s) => ({
      from: s.from,
      to: s.to,
      changedBy: s.changedBy.toString(),
      changedAt: s.changedAt instanceof Date ? s.changedAt.toISOString() : s.changedAt,
      note: s.note,
    })),
    approvedBy: po.approvedBy ? po.approvedBy.toString() : null,
    approvedAt: po.approvedAt instanceof Date ? po.approvedAt.toISOString() : po.approvedAt || null,
    rejectedBy: po.rejectedBy ? po.rejectedBy.toString() : null,
    rejectedAt: po.rejectedAt instanceof Date ? po.rejectedAt.toISOString() : po.rejectedAt || null,
    rejectionReason: po.rejectionReason || undefined,
    stockReceivedAt: po.stockReceivedAt instanceof Date ? po.stockReceivedAt.toISOString() : po.stockReceivedAt || null,
    createdAt: po.createdAt instanceof Date ? po.createdAt.toISOString() : po.createdAt,
    updatedAt: po.updatedAt instanceof Date ? po.updatedAt.toISOString() : po.updatedAt,
    isArchived: po.isArchived,
    createdBy: po.createdBy ? po.createdBy.toString() : null,
  };
}

// ---------------------------------------------------------------------------
// Valid status transitions
// ---------------------------------------------------------------------------

export const VALID_TRANSITIONS: Record<POStatus, POStatus[]> = {
  draft: ['pending_approval'],
  pending_approval: ['approved', 'rejected'],
  rejected: ['pending_approval'],
  approved: ['purchased', 'closed'],
  // 'closed' from purchased = order cancelled by the vendor / never delivered —
  // without it a purchased PO that will never arrive has no exit state.
  purchased: ['received', 'received_partial', 'closed'],
  received_partial: ['received', 'closed'],
  received: ['closed'],
  closed: [],
};

export function isValidStatusForName(s: string): s is POStatus {
  return PO_STATUSES.includes(s as POStatus);
}
