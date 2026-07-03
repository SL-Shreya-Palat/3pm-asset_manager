/**
 * Buddy AI — Field Collection Engine
 *
 * The brain of the guided field collection flow. Determines:
 *   1. Priority of each field (identity → core → descriptive → data → optional)
 *   2. Which field(s) to ask next (with batching for grouped fields)
 *   3. Progress calculation
 *   4. Completion checks
 *
 * Adapts the v3 field-engine pattern to buddy-ai's WorkflowFieldDefinition
 * and step-based orchestration. All functions are pure and side-effect-free.
 *
 * @see BUDDY_AI_V3_UPGRADE_PLAN.md Phase 2
 */

import {
  FieldPriority,
  type WorkflowFieldDefinition,
  type WorkflowSchema,
  type FieldGroupName,
} from "../workflows/types";

const IDENTITY_FIELD_NAMES = new Set([
  "client",
  "clientId",
  "projectId",
  "quoteId",
  "invoiceId",
  "siteId",
  "contactId",
]);

const CORE_NAME_FIELD_NAMES = new Set([
  "name",
  "projectName",
  "clientName",
  "quoteName",
  "invoiceName",
]);

// ---------------------------------------------------------------------------
// Priority Classification
// ---------------------------------------------------------------------------

/**
 * Classify a field into a FieldPriority tier.
 *
 * Fields with the `descriptive` flag on the schema definition are auto-classified
 * as REQUIRED_DESCRIPTIVE (when required) or OPTIONAL.
 * Fields with `optionsFrom` that are identities get REQUIRED_IDENTITY.
 */
export function classifyFieldPriority(field: WorkflowFieldDefinition): FieldPriority {
  if (IDENTITY_FIELD_NAMES.has(field.name) || (field.optionsFrom && field.type === "dropdown" && field.required)) {
    return field.required ? FieldPriority.REQUIRED_IDENTITY : FieldPriority.OPTIONAL;
  }

  if (CORE_NAME_FIELD_NAMES.has(field.name)) {
    return field.required ? FieldPriority.REQUIRED_CORE : FieldPriority.OPTIONAL;
  }

  if (field.descriptive) {
    return field.required ? FieldPriority.REQUIRED_DESCRIPTIVE : FieldPriority.OPTIONAL;
  }

  if (field.required) {
    return FieldPriority.REQUIRED_DATA;
  }

  return FieldPriority.OPTIONAL;
}

// ---------------------------------------------------------------------------
// Prioritized Field
// ---------------------------------------------------------------------------

export interface PrioritizedField {
  field: WorkflowFieldDefinition;
  priority: FieldPriority;
}

/**
 * Return all fields from a schema sorted by priority (highest first).
 * Same-priority fields preserve their original schema order.
 */
export function getSortedFields(schema: WorkflowSchema): PrioritizedField[] {
  const all = [...schema.requiredFields, ...schema.optionalFields];
  return all
    .map((field) => ({ field, priority: classifyFieldPriority(field) }))
    .filter((pf) => pf.priority !== FieldPriority.HIDDEN)
    .sort((a, b) => b.priority - a.priority);
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

export function isFieldEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Missing Fields
// ---------------------------------------------------------------------------

/**
 * Get fields that still need values (not collected, not skipped).
 */
export function getMissingFields(
  schema: WorkflowSchema,
  collectedData: Record<string, unknown>,
  skippedFields: string[]
): PrioritizedField[] {
  return getSortedFields(schema).filter((pf) => {
    if (!isFieldEmpty(collectedData[pf.field.name])) return false;
    if (skippedFields.includes(pf.field.name)) return false;
    return true;
  });
}

/**
 * Get only REQUIRED fields still missing.
 * For update workflows: fields in `selectedFields` are treated as effectively required.
 */
export function getMissingRequiredFields(
  schema: WorkflowSchema,
  collectedData: Record<string, unknown>,
  skippedFields: string[],
  selectedFields?: string[]
): PrioritizedField[] {
  const sel = new Set(selectedFields ?? []);
  return getMissingFields(schema, collectedData, skippedFields).filter(
    (pf) => pf.field.required || sel.has(pf.field.name)
  );
}

// ---------------------------------------------------------------------------
// Next Field(s) — with group batching
// ---------------------------------------------------------------------------

export interface NextFieldResult {
  primaryField: WorkflowFieldDefinition;
  batchedFields: WorkflowFieldDefinition[];
  groupName: FieldGroupName | null;
}

/**
 * Determine the next field(s) to prompt the user for.
 *
 * 1. Gets missing required fields sorted by priority
 * 2. Takes the highest-priority one as primary
 * 3. If it has a `group`, batches other missing required fields in the same group
 */
export function getNextRequiredField(
  schema: WorkflowSchema,
  collectedData: Record<string, unknown>,
  skippedFields: string[],
  selectedFields?: string[]
): NextFieldResult | null {
  const missing = getMissingRequiredFields(schema, collectedData, skippedFields, selectedFields);
  if (missing.length === 0) return null;

  const primary = missing[0];
  const groupName = primary.field.group ?? null;

  if (!groupName) {
    return { primaryField: primary.field, batchedFields: [], groupName: null };
  }

  const batched = missing
    .filter((pf) => pf.field.name !== primary.field.name && pf.field.group === groupName)
    .map((pf) => pf.field);

  return { primaryField: primary.field, batchedFields: batched, groupName };
}

/**
 * Translate a NextFieldResult into the step string used by orchestrators.
 * e.g. { primaryField: { name: "client" } } → "collect_client"
 */
export function nextFieldToStep(result: NextFieldResult, phase: "collect" | "optional" = "collect"): string {
  return `${phase}_${result.primaryField.name}`;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface FieldProgress {
  collected: number;
  skipped: number;
  total: number;
  percent: number;
  requiredRemaining: number;
}

export function calculateProgress(
  schema: WorkflowSchema,
  collectedData: Record<string, unknown>,
  skippedFields: string[]
): FieldProgress {
  const all = getSortedFields(schema);
  const total = all.length;

  let collected = 0;
  let skipped = 0;
  let requiredRemaining = 0;

  for (const pf of all) {
    const hasValue = !isFieldEmpty(collectedData[pf.field.name]);
    if (hasValue) {
      collected++;
    } else if (skippedFields.includes(pf.field.name)) {
      skipped++;
    } else if (pf.field.required) {
      requiredRemaining++;
    }
  }

  const completed = collected + skipped;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 100;

  return { collected, skipped, total, percent, requiredRemaining };
}

// ---------------------------------------------------------------------------
// Completion Checks
// ---------------------------------------------------------------------------

export function isCollectionComplete(
  schema: WorkflowSchema,
  collectedData: Record<string, unknown>,
  skippedFields: string[],
  selectedFields?: string[]
): boolean {
  return getMissingRequiredFields(schema, collectedData, skippedFields, selectedFields).length === 0;
}

// ---------------------------------------------------------------------------
// Field Lookup Helpers
// ---------------------------------------------------------------------------

export function getFieldByName(
  schema: WorkflowSchema,
  fieldName: string
): WorkflowFieldDefinition | null {
  const all = [...schema.requiredFields, ...schema.optionalFields];
  return all.find((f) => f.name === fieldName) ?? null;
}

export function isOptionalField(schema: WorkflowSchema, fieldName: string): boolean {
  return schema.optionalFields.some((f) => f.name === fieldName);
}

export function isDescriptiveField(field: WorkflowFieldDefinition): boolean {
  return !!field.descriptive;
}

/**
 * Get remaining optional fields that haven't been collected or skipped,
 * with dependencies satisfied.
 */
export function getRemainingOptionalFields(
  schema: WorkflowSchema,
  collectedData: Record<string, unknown>,
  skippedFields: string[],
  allFields: WorkflowFieldDefinition[]
): WorkflowFieldDefinition[] {
  return schema.optionalFields.filter((f) => {
    if (!isFieldEmpty(collectedData[f.name])) return false;
    if (skippedFields.includes(f.name)) return false;
    if (!areDependenciesSatisfied(f.name, allFields, collectedData)) return false;
    return true;
  });
}

/**
 * Get summary of collected data (label + raw value pairs).
 */
export function getCollectedSummary(
  schema: WorkflowSchema,
  collectedData: Record<string, unknown>
): Array<{ name: string; label: string; value: unknown }> {
  const all = [...schema.requiredFields, ...schema.optionalFields];
  return all
    .filter((f) => !isFieldEmpty(collectedData[f.name]))
    .map((f) => ({ name: f.name, label: f.label, value: collectedData[f.name] }));
}

// ---------------------------------------------------------------------------
// Dependency Check (extracted from orchestrators)
// ---------------------------------------------------------------------------

export function areDependenciesSatisfied(
  fieldName: string,
  allFields: WorkflowFieldDefinition[],
  collectedData: Record<string, unknown>
): boolean {
  const field = allFields.find((f) => f.name === fieldName);
  if (!field?.dependsOn?.length) return true;
  return field.dependsOn.every(
    (dep) => collectedData[dep] != null && String(collectedData[dep]).trim() !== ""
  );
}
