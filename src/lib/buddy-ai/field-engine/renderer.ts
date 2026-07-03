/**
 * Buddy AI — Field UI Renderer
 *
 * Builds UISchema objects for every field collection scenario.
 * Extracts the repetitive UI-building logic from orchestrators
 * into pure, testable functions.
 *
 * @see BUDDY_AI_V3_UPGRADE_PLAN.md Phase 2
 */

import type { WorkflowFieldDefinition } from "../workflows/types";
import type {
  DropdownOption,
  UISchemaFieldCollection,
  UISchemaOptionalFieldSelector,
  UISchemaConfirmButton,
  UISchemaEditFieldSelector,
  UISchemaEmptyOptions,
} from "../types";

// ---------------------------------------------------------------------------
// Field Collection UI
// ---------------------------------------------------------------------------

export type RenderFieldCollectionOptions = {
  field: WorkflowFieldDefinition;
  options?: DropdownOption[];
  isOptional?: boolean;
  isEdit?: boolean;
  validationError?: string | null;
};

/**
 * Build a UISchemaFieldCollection for any field type.
 * Replaces the per-type if/else chains in orchestrators.
 */
export function renderFieldCollectionUI(
  opts: RenderFieldCollectionOptions
): { message: string; uiSchema: UISchemaFieldCollection } {
  const { field, options = [], isOptional = false, isEdit = false, validationError } = opts;

  const prefix = isEdit ? "new " : "";
  const suffix = isOptional && !isEdit ? " (optional)" : "";
  const defaultMsg = `What's the ${prefix}${field.label.toLowerCase()}?${suffix}`;
  const message = validationError ?? defaultMsg;

  const showSkip = isOptional && !isEdit;
  const showConfirm = isOptional && !isEdit;

  const base = {
    name: field.name,
    label: field.label,
    required: isEdit ? field.required : field.required,
  };

  let uiSchema: UISchemaFieldCollection;

  switch (field.type) {
    case "dropdown":
      uiSchema = {
        type: "field_collection",
        field: { ...base, type: "dropdown", options },
        ...(showSkip && { showSkip: true }),
        ...(showConfirm && { showConfirm: true }),
      };
      break;

    case "date":
      uiSchema = {
        type: "field_collection",
        field: { ...base, type: "date" },
        ...(showSkip && { showSkip: true }),
        ...(showConfirm && { showConfirm: true }),
      };
      break;

    case "chips": {
      const chipOpts = field.chipOptions ?? options;
      uiSchema = {
        type: "field_collection",
        field: {
          ...base,
          type: "chips",
          options: chipOpts,
          ...(field.multiSelect && { multiSelect: true }),
        },
        ...(showSkip && { showSkip: true }),
        ...(showConfirm && { showConfirm: true }),
      };
      break;
    }

    case "text":
    default:
      uiSchema = {
        type: "field_collection",
        field: { ...base, type: "text" },
        ...(showSkip && { showSkip: true }),
        ...(showConfirm && { showConfirm: true }),
      };
      break;
  }

  return { message, uiSchema };
}

// ---------------------------------------------------------------------------
// Empty Options UI
// ---------------------------------------------------------------------------

export type EmptyOptionsMeta = {
  message: string;
  entityLabel: string;
  createLink?: string;
  createLinkLabel?: string;
};

export function renderEmptyOptionsUI(
  meta: EmptyOptionsMeta,
  fieldName: string,
  isRequired: boolean
): { message: string; uiSchema: UISchemaEmptyOptions } {
  return {
    message: meta.message,
    uiSchema: {
      type: "empty_options",
      message: meta.message,
      entityLabel: meta.entityLabel,
      createLink: meta.createLink,
      createLinkLabel: meta.createLinkLabel,
      fieldName,
      isRequired,
    },
  };
}

// ---------------------------------------------------------------------------
// Optional Field Selector UI
// ---------------------------------------------------------------------------

export function renderOptionalSelectorUI(
  availableOptional: Array<{ name: string; label: string }>
): { message: string; uiSchema: UISchemaOptionalFieldSelector } {
  return {
    message: "Do you want to fill any optional fields?",
    uiSchema: {
      type: "optional_field_selector",
      message: "Select fields to add, or skip to review.",
      fields: availableOptional,
      skipLabel: "Skip to review",
      showConfirm: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Confirm Button UI
// ---------------------------------------------------------------------------

export function renderConfirmButtonUI(): { message: string; uiSchema: UISchemaConfirmButton } {
  return {
    message: "Ready to review. Click Confirm to see your summary.",
    uiSchema: { type: "confirm_button", message: "Confirm" },
  };
}

// ---------------------------------------------------------------------------
// Edit Selector UI
// ---------------------------------------------------------------------------

export type EditFieldEntry = {
  name: string;
  label: string;
  value: string;
};

export function renderEditSelectorUI(
  filledFields: EditFieldEntry[],
  includeAddMore: boolean = true
): { message: string; uiSchema: UISchemaEditFieldSelector } {
  const fields: Array<{ name: string; label: string; value?: unknown }> = [
    ...filledFields,
  ];

  if (includeAddMore) {
    fields.push({ name: "_add_more", label: "Add more optional fields", value: "" });
  }

  return {
    message: "Which field do you want to change?",
    uiSchema: {
      type: "edit_field_selector",
      message: "Select a field to edit or add more optional fields.",
      fields,
      addMoreOptionalsValue: includeAddMore ? "_add_more" : undefined,
    },
  };
}
