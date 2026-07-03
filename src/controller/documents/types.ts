/**
 * Document domain types — the `documents` collection (asset / driver / team /
 * tenant "Wallet" with expiry). Matches the schema in 02-BACKEND-ARCHITECTURE.md
 * §documents and the committed indexes ({tenantId,scope,assetId} / …driverId /
 * {tenantId,expiryDate}). Enums + labels live in `@/constants/documents`.
 */
import { ObjectId } from 'mongodb';
import type { DocumentScope, DocumentStatus } from '@/constants/documents';

/** Stored document. */
export interface DocumentDoc {
  _id: ObjectId;
  tenantId: ObjectId;

  scope: DocumentScope;
  assetId?: ObjectId; // required when scope='asset'
  driverId?: ObjectId; // required when scope='driver'
  teamId?: ObjectId; // required when scope='team'

  docType: string; // ASSET_DOCUMENT_TYPES / DRIVER_DOCUMENT_TYPES member
  title: string;
  fileUrl?: string;
  fileName?: string;
  expiryDate?: Date | null; // drives status + reminders
  reminderDays: number; // lead time; also the "expiring soon" window
  notes?: string;

  // reminder bookkeeping (set by a future scan job — kept for forward-compat)
  lastRemindedAt?: Date | null;

  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
  archivedAt?: Date | null;
  archivedBy?: ObjectId | null;
}

/** Input for creating a document. */
export interface CreateDocumentInput {
  scope: string;
  assetId?: string;
  driverId?: string;
  teamId?: string;
  docType: string;
  title?: string;
  fileUrl?: string;
  fileName?: string;
  expiryDate?: string;
  reminderDays?: number;
  notes?: string;
}

/** Input for updating a document (also powers the one-tap Renew action). */
export type UpdateDocumentInput = Partial<CreateDocumentInput>;

/** Serialized document for API responses — includes derived status. */
export interface DocumentResponse {
  id: string;
  scope: DocumentScope;
  assetId?: string;
  driverId?: string;
  teamId?: string;
  docType: string;
  title: string;
  fileUrl?: string;
  fileName?: string;
  expiryDate?: string | null;
  reminderDays: number;
  notes?: string;
  status: DocumentStatus; // derived
  daysUntilExpiry: number | null; // derived (negative = expired), null when no expiry
  createdAt: string | null;
  updatedAt: string | null;
}
