/**
 * Submit-time defect evaluator (§6).
 *
 * Pure function: given the saved defect settings, a fieldKey-keyed response, and
 * the form's field maps, it decides which answers are defects. No DB access — the
 * caller (processInspectionSubmission) loads the form/settings and normalizes the
 * response keys, so this stays trivially testable and 100% deterministic.
 */
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
 * Evaluate a normalized response against saved defect settings.
 *
 * @param defectAnswers    fieldKey → answer value(s) that mean a defect
 * @param severityByField  fieldKey → severity (defaults to non_critical)
 * @param response         fieldKey-keyed submission answers
 * @param typeByFieldKey   fieldKey → field type (eligibility guard)
 * @param labelByFieldKey  fieldKey → human label (for the defect name)
 */
export function evaluateDefects(
  defectAnswers: Record<string, string[]>,
  severityByField: Record<string, SeverityValue>,
  response: Record<string, unknown>,
  typeByFieldKey: Map<string, string>,
  labelByFieldKey: Map<string, string>,
): EvaluationResult {
  const defects: DetectedDefect[] = [];

  for (const [fieldKey, badValues] of Object.entries(defectAnswers || {})) {
    if (!Array.isArray(badValues) || badValues.length === 0) continue;

    // Only choice-type fields can be a defect source.
    const fieldType = typeByFieldKey.get(fieldKey);
    if (fieldType && !(ELIGIBLE_FIELD_TYPES as readonly string[]).includes(fieldType)) continue;

    const answer = response[fieldKey];
    if (answer === undefined || answer === null) continue;

    const isDefect = Array.isArray(answer)
      ? answer.some((v) => badValues.includes(String(v))) // multiselect: any bad option
      : badValues.includes(String(answer)); // single choice / toggle / checkbox

    if (isDefect) {
      defects.push({
        fieldKey,
        label: labelByFieldKey.get(fieldKey) || fieldKey,
        answer: Array.isArray(answer) ? answer.map(String) : String(answer),
        severity: severityByField[fieldKey] || 'non_critical',
      });
    }
  }

  return { result: defects.length > 0 ? 'fail' : 'pass', defects };
}
