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
  /** fieldKey → true when a flagged answer on this field takes the asset Out of Service. */
  outOfServiceByField?: Record<string, boolean>;
  /** fieldKey → true when the field is explicitly ignored (does nothing on submit). */
  ignoredByField?: Record<string, boolean>;
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
  outOfServiceByField?: Record<string, boolean>;
  ignoredByField?: Record<string, boolean>;
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
  /** Title of the form page this field belongs to (for grouping in the UI). */
  page: string;
  /** Available option values (for dropdown/radio/multiselect). */
  options: { id: string; title: string; value: string }[];
  /** Currently ticked "bad" values from saved settings. */
  selectedDefectValues: string[];
  /** Severity override for this field. */
  severity: SeverityValue;
  /** When true, a flagged answer here takes the asset Out of Service. */
  outOfService: boolean;
  /** When true, the field is ignored — no chips/severity, does nothing on submit. */
  ignored: boolean;
}

/**
 * PUT/POST body for upserting defect settings.
 */
export interface UpsertDefectSettingsInput {
  defectAnswers: Record<string, string[]>;
  severityByField?: Record<string, SeverityValue>;
  outOfServiceByField?: Record<string, boolean>;
  ignoredByField?: Record<string, boolean>;
}
