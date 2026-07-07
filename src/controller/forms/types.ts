/**
 * Types for form creation webhook data
 */

import { ObjectId } from 'mongodb';

export interface FormCreationWebhookPayload {
  event: string;
  timestamp: string;
  data: FormCreationData;
}

export interface FormSchema {
  formId: string;
  organizationId: string;
  pages: unknown[]; // The actual schema pages array
  versionNumber: number | null; // null for draft schemas
  publishedAt: string | Date | null; // null for draft schemas
  publishedBy: string | null; // null for draft schemas
  notes: string | null; // null for draft schemas
}

export interface FormCreationData {
  organizationId: string;
  formId: string;
  formTitle: string;
  createdAt: string | Date;
  createdBy: string;
  type?: string | null;
  /** What this form inspects — drives the driver-flag vs asset-defect outcome. */
  inspectionType?: 'asset' | 'driver';
  status: string;
  source?: 'app' | 'embed';
  appId?: string;
  schema?: FormSchema;
}

export interface FormDocument {
  _id?: ObjectId;
  tenantId?: ObjectId;
  organizationId: ObjectId;
  formId: ObjectId;
  formTitle: string;
  createdAt: Date;
  createdBy: ObjectId;
  type?: string | null;
  /** What this form inspects — 'asset' (default) or 'driver'. */
  inspectionType?: 'asset' | 'driver';
  status: string;
  source?: 'app' | 'embed';
  appId?: ObjectId;
  schema?: {
    formId: string;
    organizationId: string;
    pages: unknown[];
    versionNumber: number | null;
    publishedAt: Date | null;
    publishedBy: ObjectId | null;
    notes: string | null;
  };
  createdAtPortal: Date;
  updatedAt: Date;
}

export interface FormResponse {
  id: string;
  tenantId?: string;
  organizationId: string;
  formId: string;
  formTitle: string;
  createdAt: Date;
  createdBy: string;
  type?: string | null;
  /** What this form inspects — 'asset' (default) or 'driver'. */
  inspectionType: 'asset' | 'driver';
  status: string;
  source?: 'app' | 'embed';
  appId?: string;
  schema?: {
    formId: string;
    organizationId: string;
    pages: unknown[];
    versionNumber: number | null;
    publishedAt: Date | null;
    publishedBy: string | null;
    notes: string | null;
  };
  createdAtPortal: Date;
  updatedAt: Date;
}
