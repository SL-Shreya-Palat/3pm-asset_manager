/**
 * Shared server-side validators — used by every create/update handler.
 *
 * Keep them tiny and composable. Add new validators here when a rule repeats
 * across two or more handlers.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
// Allowed characters: digits, spaces, parentheses, dashes, and a leading "+".
const PHONE_CHARS_REGEX = /^\+?[0-9 ()-]+$/;

/** True when the value is a valid email address. */
export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && EMAIL_REGEX.test(value);
}

/** True when the value is a 24-hex-char MongoDB ObjectId string. */
export function isValidObjectId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_REGEX.test(value);
}

/** True when the value is a non-empty trimmed string. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Asserts the value is a required non-empty string, returns trimmed. Throws on failure. */
export function ensureRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 500,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

/**
 * True when the value looks like a real phone number: only allowed characters,
 * and between 7 and 15 digits (E.164 caps at 15). Rejects too-short inputs
 * like "325345".
 */
export function isValidPhone(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!PHONE_CHARS_REGEX.test(trimmed)) return false;
  const digitCount = trimmed.replace(/\D/g, '').length;
  return digitCount >= 7 && digitCount <= 15;
}

/** True when the value is a member of the given `as const` array. */
export function isEnumMember<T extends readonly string[]>(
  value: unknown,
  enumValues: T,
): value is T[number] {
  return typeof value === 'string' && (enumValues as readonly string[]).includes(value);
}

/** Validate a number is within a range. */
export function isInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return typeof value === 'number' && !isNaN(value) && value >= min && value <= max;
}
