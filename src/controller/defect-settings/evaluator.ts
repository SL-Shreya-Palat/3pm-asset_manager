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
import type { FieldOption } from '@/controller/forms/schema-utils';

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

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();
const TRUE_SET = new Set(['true', 'on', 'yes', '1']);
const FALSE_SET = new Set(['false', 'off', 'no', '0']);

/** Boolean-ish equivalence so a toggle stored as `false` matches on/off/no/0 etc. */
function booleanEquiv(a: string, b: string): boolean {
  return (TRUE_SET.has(a) && TRUE_SET.has(b)) || (FALSE_SET.has(a) && FALSE_SET.has(b));
}

/**
 * Does a submitted `answer` match a configured `badValue` for a field?
 * Tolerant of case/whitespace, value↔title differences (the form may submit the
 * option title instead of its value), and boolean representations.
 */
function answerMatchesBad(answerRaw: unknown, badValue: string, options: FieldOption[]): boolean {
  const a = norm(answerRaw);
  const b = norm(badValue);
  if (!a) return false;
  if (a === b || booleanEquiv(a, b)) return true;
  // Resolve badValue → its option, then accept either the option's value or title.
  for (const opt of options) {
    const ov = norm(opt.value);
    const ot = norm(opt.title);
    if ((ov === b || ot === b) && (a === ov || a === ot)) return true;
  }
  return false;
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
  optionsByFieldKey: Map<string, FieldOption[]>,
): EvaluationResult {
  const defects: DetectedDefect[] = [];

  for (const [fieldKey, badValues] of Object.entries(defectAnswers || {})) {
    if (!Array.isArray(badValues) || badValues.length === 0) continue;

    // Only choice-type fields can be a defect source.
    const fieldType = typeByFieldKey.get(fieldKey);
    if (fieldType && !(ELIGIBLE_FIELD_TYPES as readonly string[]).includes(fieldType)) continue;

    const answer = response[fieldKey];
    if (answer === undefined || answer === null) continue;

    // Tolerant match: case/whitespace, value↔title, and boolean representations.
    const options = optionsByFieldKey.get(fieldKey) || [];
    const answers = Array.isArray(answer) ? answer : [answer]; // multiselect: any bad option
    const isDefect = answers.some((a) => badValues.some((bad) => answerMatchesBad(a, bad, options)));

    if (isDefect) {
      defects.push({
        fieldKey,
        label: labelByFieldKey.get(fieldKey) || fieldKey,
        answer: Array.isArray(answer) ? answer.map(String) : String(answer),
        severity: severityByField[fieldKey] || 'low',
      });
    }
  }

  return { result: defects.length > 0 ? 'fail' : 'pass', defects };
}
