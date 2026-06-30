/**
 * Types for the prestartFormDefectSettings collection.
 */
import { ObjectId } from 'mongodb';

export const SEVERITY_VALUES = ['critical', 'non_critical'] as const;
export type SeverityValue = (typeof SEVERITY_VALUES)[number];

/** Eligible field types that can generate defects. */
export const ELIGIBLE_FIELD_TYPES = ['dropdown', 'radio', 'multiselect', 'checkbox', 'toggle'] as const;
export type EligibleFieldType = (typeof ELIGIBLE_FIELD_TYPES)[number];

/**
 * Stored document shape — one per form per tenant.
 */
export interface DefectSettingsDocument {
  _id?: ObjectId;
  tenantId: ObjectId;
  formId: ObjectId;
  formVersion: number;
  /** fieldKey → answer value(s) that mean a defect. */
  defectAnswers: Record<string, string[]>;
  /** Optional severity override per field. Defaults to "non_critical". */
  severityByField?: Record<string, SeverityValue>;
  updatedAt: Date;
  updatedBy: ObjectId;
}

/**
 * API response shape (serialized).
 */
export interface DefectSettingsResponse {
  tenantId: string;
  formId: string;
  formVersion: number;
  defectAnswers: Record<string, string[]>;
  severityByField?: Record<string, SeverityValue>;
  updatedAt: string;
  updatedBy: string;
}

/**
 * An eligible field extracted from the form schema, enriched with saved ticks.
 */
export interface EligibleField {
  fieldKey: string;
  label: string;
  type: EligibleFieldType;
  /** Available option values (for dropdown/radio/multiselect). */
  options: { id: string; title: string; value: string }[];
  /** Currently ticked "bad" values from saved settings. */
  selectedDefectValues: string[];
  /** Severity override for this field. */
  severity: SeverityValue;
}

/**
 * PUT/POST body for upserting defect settings.
 */
export interface UpsertDefectSettingsInput {
  defectAnswers: Record<string, string[]>;
  severityByField?: Record<string, SeverityValue>;
}
