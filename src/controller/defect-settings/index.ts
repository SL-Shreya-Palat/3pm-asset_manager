/**
 * Defect-settings controller.
 *
 * Reads the live published schema from the local `forms` collection,
 * flattens eligible fields, and merges with any saved defect-answer ticks.
 */
import { ObjectId } from 'mongodb';
import {
  getPrestartFormDefectSettingsCollection,
  getFormsCollection,
} from '@/lib/mongodb';
import type {
  DefectSettingsDocument,
  DefectSettingsResponse,
  EligibleField,
  EligibleFieldType,
  UpsertDefectSettingsInput,
  SeverityValue,
} from './types';
import { ELIGIBLE_FIELD_TYPES, SEVERITY_VALUES } from './types';

// ── helpers ──────────────────────────────────────────────────────────────────

function isEligible(type: string): type is EligibleFieldType {
  return (ELIGIBLE_FIELD_TYPES as readonly string[]).includes(type);
}

/**
 * Flatten pages → fields, recursing into field groups.
 * Returns only eligible (choice-based) fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEligibleFields(pages: any[]): EligibleField[] {
  const result: EligibleField[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(items: any[]) {
    for (const field of items) {
      if (field.type === 'fieldgroup' && Array.isArray(field.items)) {
        walk(field.items);
        continue;
      }

      if (!isEligible(field.type)) continue;

      let options: { id: string; title: string; value: string }[] = [];

      if (['dropdown', 'radio', 'multiselect'].includes(field.type) && Array.isArray(field.options)) {
        options = field.options.map((o: { id: string; title: string; value: string }) => ({
          id: o.id,
          title: o.title,
          value: o.value,
        }));
      } else if (['checkbox', 'toggle'].includes(field.type)) {
        // Synthetic options: defect when on / defect when off
        options = [
          { id: `${field.fieldKey}_on`, title: 'On', value: 'true' },
          { id: `${field.fieldKey}_off`, title: 'Off', value: 'false' },
        ];
      }

      result.push({
        fieldKey: field.fieldKey,
        label: field.label,
        type: field.type as EligibleFieldType,
        options,
        selectedDefectValues: [],
        severity: 'non_critical',
      });
    }
  }

  for (const page of pages) {
    if (Array.isArray(page.items)) walk(page.items);
  }

  return result;
}

function serialize(doc: DefectSettingsDocument): DefectSettingsResponse {
  return {
    tenantId: doc.tenantId.toString(),
    formId: doc.formId.toString(),
    formVersion: doc.formVersion,
    defectAnswers: doc.defectAnswers,
    severityByField: doc.severityByField,
    updatedAt: doc.updatedAt.toISOString(),
    updatedBy: doc.updatedBy.toString(),
  };
}

// ── GET ──────────────────────────────────────────────────────────────────────

/**
 * Returns eligible fields from the live published schema, merged with any
 * previously saved defect-answer ticks.
 */
export async function getDefectSettings(tenantId: string, formId: string) {
  const formsCol = await getFormsCollection();
  const settingsCol = await getPrestartFormDefectSettingsCollection();

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const formOid = ObjectId.createFromHexString(formId);

  // Load form with published schema
  const form = await formsCol.findOne({ formId: formOid, tenantId: tenantOid });
  if (!form) return { data: null, error: 'Form not found' };

  const pages = form.schema?.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    return { data: null, error: 'Form has no published schema' };
  }

  const eligible = extractEligibleFields(pages);

  // Load saved settings
  const saved = await settingsCol.findOne({ tenantId: tenantOid, formId: formOid }) as DefectSettingsDocument | null;

  // Merge saved ticks into eligible fields
  if (saved) {
    for (const field of eligible) {
      field.selectedDefectValues = saved.defectAnswers[field.fieldKey] || [];
      field.severity = saved.severityByField?.[field.fieldKey] || 'non_critical';
    }
  }

  return {
    data: {
      formId,
      formTitle: form.formTitle as string,
      formVersion: (form.schema?.versionNumber as number) || 1,
      fields: eligible,
      savedSettings: saved ? serialize(saved) : null,
    },
    error: null,
  };
}

// ── UPSERT ───────────────────────────────────────────────────────────────────

export async function upsertDefectSettings(
  tenantId: string,
  userId: string,
  formId: string,
  input: UpsertDefectSettingsInput,
) {
  // Validate
  if (!input.defectAnswers || typeof input.defectAnswers !== 'object') {
    return { data: null, error: 'defectAnswers must be an object' };
  }

  for (const [key, vals] of Object.entries(input.defectAnswers)) {
    if (!Array.isArray(vals) || vals.some((v) => typeof v !== 'string')) {
      return { data: null, error: `defectAnswers["${key}"] must be an array of strings` };
    }
  }

  if (input.severityByField) {
    for (const [key, sev] of Object.entries(input.severityByField)) {
      if (!(SEVERITY_VALUES as readonly string[]).includes(sev)) {
        return { data: null, error: `severityByField["${key}"] must be "critical" or "non_critical"` };
      }
    }
  }

  const formsCol = await getFormsCollection();
  const settingsCol = await getPrestartFormDefectSettingsCollection();

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const formOid = ObjectId.createFromHexString(formId);
  const userOid = ObjectId.createFromHexString(userId);

  // Load current published schema to get version & validate field keys
  const form = await formsCol.findOne({ formId: formOid, tenantId: tenantOid });
  if (!form) return { data: null, error: 'Form not found' };

  const pages = form.schema?.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    return { data: null, error: 'Form has no published schema' };
  }

  const eligible = extractEligibleFields(pages);
  const validKeys = new Set(eligible.map((f) => f.fieldKey));

  // Drop any fieldKey no longer present in the schema
  const cleanedAnswers: Record<string, string[]> = {};
  for (const [key, vals] of Object.entries(input.defectAnswers)) {
    if (validKeys.has(key) && vals.length > 0) {
      cleanedAnswers[key] = vals;
    }
  }

  const cleanedSeverity: Record<string, SeverityValue> = {};
  if (input.severityByField) {
    for (const [key, sev] of Object.entries(input.severityByField)) {
      if (validKeys.has(key)) {
        cleanedSeverity[key] = sev;
      }
    }
  }

  const formVersion = (form.schema?.versionNumber as number) || 1;
  const now = new Date();

  await settingsCol.updateOne(
    { tenantId: tenantOid, formId: formOid },
    {
      $set: {
        formVersion,
        defectAnswers: cleanedAnswers,
        severityByField: Object.keys(cleanedSeverity).length > 0 ? cleanedSeverity : undefined,
        updatedAt: now,
        updatedBy: userOid,
      } satisfies Partial<DefectSettingsDocument>,
      $setOnInsert: {
        tenantId: tenantOid,
        formId: formOid,
      },
    },
    { upsert: true },
  );

  const updated = await settingsCol.findOne({ tenantId: tenantOid, formId: formOid }) as DefectSettingsDocument | null;

  return {
    data: updated ? serialize(updated) : null,
    error: null,
  };
}
