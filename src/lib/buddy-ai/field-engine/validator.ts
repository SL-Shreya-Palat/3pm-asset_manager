/**
 * Buddy AI — Field Validation Engine
 *
 * Centralized validation logic for workflow fields.
 * Orchestrators call these before accepting a field value.
 *
 * Keeps validation rules in one place so they can be reused
 * across create and update orchestrators identically.
 *
 * @see BUDDY_AI_V3_UPGRADE_PLAN.md Phase 2
 */

import type { WorkflowFieldDefinition } from "../workflows/types";
import { isFieldEmpty } from "./collector";

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export type FieldValidationResult =
  | { valid: true }
  | { valid: false; error: string };

// ---------------------------------------------------------------------------
// Per-field validation
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a single field value against its type constraints.
 *
 * - text: non-empty string when required
 * - date: must be a valid ISO date (YYYY-MM-DD)
 * - dropdown: must be a non-empty string (ID)
 * - chips: must be a non-empty array of strings
 */
export function validateFieldValue(
  field: WorkflowFieldDefinition,
  value: unknown
): FieldValidationResult {
  if (isFieldEmpty(value)) {
    if (field.required) {
      return { valid: false, error: `${field.label} is required.` };
    }
    return { valid: true };
  }

  switch (field.type) {
    case "date": {
      const str = String(value);
      if (!ISO_DATE_RE.test(str)) {
        return { valid: false, error: `${field.label} must be a valid date (YYYY-MM-DD).` };
      }
      const d = new Date(str);
      if (isNaN(d.getTime())) {
        return { valid: false, error: `${field.label} is not a real date.` };
      }
      return { valid: true };
    }

    case "dropdown": {
      if (typeof value !== "string" || value.trim() === "") {
        return { valid: false, error: `Please select a valid ${field.label.toLowerCase()}.` };
      }
      return { valid: true };
    }

    case "chips": {
      if (!Array.isArray(value) || value.length === 0) {
        return { valid: false, error: `Please select at least one ${field.label.toLowerCase()}.` };
      }
      return { valid: true };
    }

    case "text":
    default: {
      if (typeof value !== "string" || value.trim() === "") {
        return { valid: false, error: `${field.label} cannot be empty.` };
      }
      return { valid: true };
    }
  }
}

// ---------------------------------------------------------------------------
// Batch validation
// ---------------------------------------------------------------------------

export type BatchValidationResult = {
  valid: boolean;
  errors: Array<{ fieldName: string; error: string }>;
};

/**
 * Validate all collected data against the field definitions.
 * Returns all errors at once (for confirmation/review screens).
 */
export function validateCollectedData(
  fields: WorkflowFieldDefinition[],
  collectedData: Record<string, unknown>
): BatchValidationResult {
  const errors: Array<{ fieldName: string; error: string }> = [];

  for (const field of fields) {
    const value = collectedData[field.name];
    const result = validateFieldValue(field, value);
    if (!result.valid) {
      errors.push({ fieldName: field.name, error: result.error });
    }
  }

  return { valid: errors.length === 0, errors };
}
