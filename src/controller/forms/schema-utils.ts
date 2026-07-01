/**
 * Form-schema helpers shared by inspection-submission processing.
 *
 * The form-builder stores a submission's answers keyed by each field's `id`,
 * while our defect-settings and evaluator key by the stable `fieldKey`. These
 * helpers walk a stored form schema once and translate between the two, so every
 * entry point (webhook, sync, manual) maps answers identically — the form itself
 * stays "dumb" and all defect logic lives here.
 */

export interface FieldOption {
  value: string;
  title: string;
}

export interface FormFieldMaps {
  /** field.id → fieldKey */
  idToFieldKey: Map<string, string>;
  /** fieldKey → human-readable label */
  labelByFieldKey: Map<string, string>;
  /** fieldKey → field type (e.g. radio, multiselect, text) */
  typeByFieldKey: Map<string, string>;
  /** fieldKey → its choice options (for value↔title tolerant matching) */
  optionsByFieldKey: Map<string, FieldOption[]>;
}

interface SchemaField {
  id?: string;
  fieldKey?: string;
  label?: string;
  type?: string;
  items?: SchemaField[];
  options?: { value?: string; title?: string }[];
}

interface FormSchema {
  pages?: { items?: SchemaField[] }[];
}

/** Walk a stored form schema once and build the id/label/type lookup maps. */
export function buildFormFieldMaps(schema: unknown): FormFieldMaps {
  const idToFieldKey = new Map<string, string>();
  const labelByFieldKey = new Map<string, string>();
  const typeByFieldKey = new Map<string, string>();
  const optionsByFieldKey = new Map<string, FieldOption[]>();

  const pages = (schema as FormSchema | undefined)?.pages;
  if (!Array.isArray(pages)) {
    return { idToFieldKey, labelByFieldKey, typeByFieldKey, optionsByFieldKey };
  }

  const walk = (items: SchemaField[]) => {
    for (const field of items) {
      // Recurse into field groups (nested questions).
      if (field.type === 'fieldgroup' && Array.isArray(field.items)) {
        walk(field.items);
        continue;
      }
      if (field.fieldKey) {
        if (field.id) idToFieldKey.set(field.id, field.fieldKey);
        labelByFieldKey.set(field.fieldKey, field.label || field.fieldKey);
        if (field.type) typeByFieldKey.set(field.fieldKey, field.type);
        if (Array.isArray(field.options)) {
          optionsByFieldKey.set(
            field.fieldKey,
            field.options.map((o) => ({ value: String(o.value ?? ''), title: String(o.title ?? '') })),
          );
        }
      }
    }
  };

  for (const page of pages) {
    if (Array.isArray(page.items)) walk(page.items);
  }

  return { idToFieldKey, labelByFieldKey, typeByFieldKey, optionsByFieldKey };
}

/**
 * Translate a raw submission response into a fieldKey-keyed response.
 *
 * Safe & idempotent: a key that is already a fieldKey (not present in the
 * id→fieldKey map) is kept as-is, so calling this on an already-normalized
 * response is a no-op. This is what makes every entry point 100% consistent.
 */
export function normalizeResponseKeys(
  maps: FormFieldMaps,
  rawResponse: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawResponse)) {
    normalized[maps.idToFieldKey.get(key) ?? key] = value;
  }
  return normalized;
}

/**
 * Identify which fieldKey holds the asset's unit/fleet number, so a submission
 * can be linked to its asset.
 *
 * Deterministic for the seeded templates (the "Unit Number" field → fieldKey
 * `unit_number`); falls back to a conservative label scan on text-like fields
 * for custom forms, so it never mistakes a pass/fail item for the unit number.
 */
const ASSET_FIELD_KEYS = [
  'unit_number',
  'asset_number',
  'unit_no',
  'asset_no',
  'fleet_number',
  'vehicle_number',
  'asset_id',
  'unit',
];
const ASSET_LABEL_RE = /\b(unit|asset|fleet|vehicle)\s*(number|no\.?|id|code|#)\b/i;
const TEXT_LIKE_TYPES = new Set(['text', 'number', 'identifier']);

export function detectAssetFieldKey(maps: FormFieldMaps): string | null {
  // 1) Exact fieldKey match — covers the seeded templates with 100% certainty.
  for (const key of ASSET_FIELD_KEYS) {
    if (maps.labelByFieldKey.has(key)) return key;
  }
  // 2) Conservative label scan, text-like fields only (never a choice item).
  for (const [fieldKey, label] of maps.labelByFieldKey) {
    const type = maps.typeByFieldKey.get(fieldKey) ?? 'text';
    if (TEXT_LIKE_TYPES.has(type) && ASSET_LABEL_RE.test(label)) return fieldKey;
  }
  return null;
}
