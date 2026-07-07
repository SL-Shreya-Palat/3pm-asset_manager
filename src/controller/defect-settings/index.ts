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
import { fetchLiveFormSchema } from '@/lib/form-builder-integration';
import { classifyInspectionType } from '@/controller/forms';
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

/** Map legacy severity values (critical / non_critical) to the new high/medium/low scale. */
function migrateSeverity(value: string | undefined): SeverityValue {
  if (!value) return 'low';
  if (value === 'critical') return 'high';
  if (value === 'non_critical') return 'low';
  if ((SEVERITY_VALUES as readonly string[]).includes(value)) return value as SeverityValue;
  return 'low';
}

/**
 * Flatten pages → fields, recursing into field groups.
 * Returns only eligible (choice-based) fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEligibleFields(pages: any[]): EligibleField[] {
  const result: EligibleField[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(items: any[], pageTitle: string) {
    for (const field of items) {
      if (field.type === 'fieldgroup' && Array.isArray(field.items)) {
        walk(field.items, pageTitle);
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
        page: pageTitle,
        options,
        selectedDefectValues: [],
        severity: 'low',
        outOfService: false,
        ignored: false,
      });
    }
  }

  for (const page of pages) {
    if (Array.isArray(page.items)) walk(page.items, (page.title as string) || 'Other');
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
    outOfServiceByField: doc.outOfServiceByField,
    ignoredByField: doc.ignoredByField,
    updatedAt: doc.updatedAt.toISOString(),
    updatedBy: doc.updatedBy.toString(),
  };
}

// ── GET ──────────────────────────────────────────────────────────────────────

/**
 * Returns eligible fields from the live published schema, merged with any
 * previously saved defect-answer ticks.
 */
export async function getDefectSettings(
  tenantId: string,
  formId: string,
  user?: { email?: string | null; name?: string | null },
) {
  const formsCol = await getFormsCollection();
  const settingsCol = await getPrestartFormDefectSettingsCollection();

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const formOid = ObjectId.createFromHexString(formId);

  const form = await formsCol.findOne({ formId: formOid, tenantId: tenantOid });
  if (!form) return { data: null, error: 'Form not found' };

  // Prefer the LIVE schema from the builder — the local mirror can be stale if the
  // form was edited after seeding (only the form.updated webhook refreshes it).
  // Persist what we fetch so submission processing reads the same current fields.
  // Falls back to the local mirror on any failure.
  let pages = (form.schema?.pages as unknown[]) ?? [];
  let formVersion = (form.schema?.versionNumber as number) || 1;
  let source: 'live' | 'local' = 'local';

  if (user?.email) {
    const live = await fetchLiveFormSchema(user.email, user.name || user.email, formId);
    if (live && Array.isArray(live.pages) && live.pages.length > 0) {
      pages = live.pages;
      formVersion = live.versionNumber ?? formVersion;
      source = 'live';
      await formsCol.updateOne(
        { _id: form._id },
        {
          $set: {
            'schema.pages': live.pages,
            'schema.versionNumber': formVersion,
            ...(live.publishedAt ? { 'schema.publishedAt': new Date(live.publishedAt) } : {}),
            updatedAt: new Date(),
          },
        },
      );
    }
  }

  if (!Array.isArray(pages) || pages.length === 0) {
    return { data: null, error: 'Form has no published schema' };
  }

  const eligible = extractEligibleFields(pages);

  // Merge saved ticks into eligible fields
  const saved = await settingsCol.findOne({ tenantId: tenantOid, formId: formOid }) as DefectSettingsDocument | null;
  if (saved) {
    for (const field of eligible) {
      field.selectedDefectValues = saved.defectAnswers[field.fieldKey] || [];
      field.severity = migrateSeverity(saved.severityByField?.[field.fieldKey]);
      field.outOfService = saved.outOfServiceByField?.[field.fieldKey] || false;
      field.ignored = saved.ignoredByField?.[field.fieldKey] || false;
    }
  }

  return {
    data: {
      formId,
      formTitle: form.formTitle as string,
      formVersion,
      inspectionType:
        (form.inspectionType as 'asset' | 'driver' | undefined) ||
        classifyInspectionType(form.formTitle as string),
      fields: eligible,
      savedSettings: saved ? serialize(saved) : null,
      source,
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
        return { data: null, error: `severityByField["${key}"] must be "high", "medium", or "low"` };
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

  // Ignored fields do nothing — record them and exclude them from every rule below.
  const cleanedIgnored: Record<string, boolean> = {};
  if (input.ignoredByField) {
    for (const [key, on] of Object.entries(input.ignoredByField)) {
      if (on && validKeys.has(key)) cleanedIgnored[key] = true;
    }
  }

  // Drop any fieldKey no longer present in the schema (or ignored).
  const cleanedAnswers: Record<string, string[]> = {};
  for (const [key, vals] of Object.entries(input.defectAnswers)) {
    if (validKeys.has(key) && !cleanedIgnored[key] && vals.length > 0) {
      cleanedAnswers[key] = vals;
    }
  }

  const cleanedSeverity: Record<string, SeverityValue> = {};
  if (input.severityByField) {
    for (const [key, sev] of Object.entries(input.severityByField)) {
      if (validKeys.has(key) && !cleanedIgnored[key]) {
        cleanedSeverity[key] = sev;
      }
    }
  }

  // Only keep out-of-service flags for fields that are still valid AND actually
  // have flagged answers (an out-of-service flag with no bad answer is a no-op).
  const cleanedOutOfService: Record<string, boolean> = {};
  if (input.outOfServiceByField) {
    for (const [key, on] of Object.entries(input.outOfServiceByField)) {
      if (on && validKeys.has(key) && (cleanedAnswers[key]?.length ?? 0) > 0) {
        cleanedOutOfService[key] = true;
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
        outOfServiceByField: Object.keys(cleanedOutOfService).length > 0 ? cleanedOutOfService : undefined,
        ignoredByField: Object.keys(cleanedIgnored).length > 0 ? cleanedIgnored : undefined,
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
