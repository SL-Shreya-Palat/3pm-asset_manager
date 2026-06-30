/**
 * Submit-time defect evaluator (§6).
 *
 * Given a form submission's response data and the saved defect-settings for
 * that form, determines which answers constitute defects and returns them.
 */
import { ObjectId } from 'mongodb';
import {
  getPrestartFormDefectSettingsCollection,
  getFormsCollection,
} from '@/lib/mongodb';
import type { SeverityValue } from './types';
import { ELIGIBLE_FIELD_TYPES } from './types';

export interface DetectedDefect {
  fieldKey: string;
  label: string;
  answer: string | string[];
  severity: SeverityValue;
}

export interface EvaluationResult {
  result: 'pass' | 'fail';
  defects: DetectedDefect[];
}

/**
 * Evaluate a submission's response against saved defect settings.
 *
 * @param tenantId  - current tenant
 * @param formId    - the form-builder formId (ObjectId hex string)
 * @param response  - the submitted response object (fieldKey → answer)
 */
export async function evaluateSubmission(
  tenantId: string,
  formId: string,
  response: Record<string, unknown>,
): Promise<EvaluationResult> {
  const settingsCol = await getPrestartFormDefectSettingsCollection();
  const formsCol = await getFormsCollection();

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const formOid = ObjectId.createFromHexString(formId);

  // Load saved defect settings
  const settings = await settingsCol.findOne({ tenantId: tenantOid, formId: formOid });
  if (!settings || !settings.defectAnswers) {
    return { result: 'pass', defects: [] };
  }

  // Load form schema to get field labels
  const form = await formsCol.findOne({ formId: formOid, tenantId: tenantOid });
  const pages = form?.schema?.pages as { items: { fieldKey: string; label: string; type: string; items?: unknown[] }[] }[] | undefined;

  // Build fieldKey→label map by walking the schema
  const labelMap = new Map<string, string>();
  const typeMap = new Map<string, string>();
  if (pages) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function walk(items: any[]) {
      for (const field of items) {
        if (field.type === 'fieldgroup' && Array.isArray(field.items)) {
          walk(field.items);
          continue;
        }
        if (field.fieldKey) {
          labelMap.set(field.fieldKey, field.label || field.fieldKey);
          typeMap.set(field.fieldKey, field.type);
        }
      }
    }
    for (const page of pages) {
      if (Array.isArray(page.items)) walk(page.items);
    }
  }

  const defectAnswers = settings.defectAnswers as Record<string, string[]>;
  const severityByField = (settings.severityByField || {}) as Record<string, SeverityValue>;

  const defects: DetectedDefect[] = [];

  for (const [fieldKey, badValues] of Object.entries(defectAnswers)) {
    if (!badValues || badValues.length === 0) continue;

    // Only evaluate eligible field types
    const fieldType = typeMap.get(fieldKey);
    if (fieldType && !(ELIGIBLE_FIELD_TYPES as readonly string[]).includes(fieldType)) continue;

    const answer = response[fieldKey];
    if (answer === undefined || answer === null) continue;

    let isDefect = false;

    if (Array.isArray(answer)) {
      // multiselect — defect if any selected value is in badValues
      isDefect = answer.some((v) => badValues.includes(String(v)));
    } else {
      // single choice / toggle / checkbox
      isDefect = badValues.includes(String(answer));
    }

    if (isDefect) {
      defects.push({
        fieldKey,
        label: labelMap.get(fieldKey) || fieldKey,
        answer: Array.isArray(answer) ? answer.map(String) : String(answer),
        severity: severityByField[fieldKey] || 'non_critical',
      });
    }
  }

  return {
    result: defects.length > 0 ? 'fail' : 'pass',
    defects,
  };
}
