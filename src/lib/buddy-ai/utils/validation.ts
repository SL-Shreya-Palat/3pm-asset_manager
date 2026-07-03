/**
 * Buddy AI — Field validation & normalization
 *
 * Validates and normalizes user input before storing in collectedData.
 * Used by workflow orchestrators to catch bad data early.
 */

import { isValidEmail } from "@/lib/validation/commonValidators";

export type ValidationResult =
  | { valid: true; value: unknown }
  | { valid: false; error: string };

/**
 * Parse a date string into ISO YYYY-MM-DD format.
 * Accepts: "2026-02-17", "17/02/2026", "17-02-2026", "Feb 17, 2026", etc.
 * Returns null if unparseable.
 */
export function parseDate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Already ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed + "T00:00:00");
    if (!isNaN(d.getTime())) return trimmed;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const d = new Date(iso + "T00:00:00");
    if (!isNaN(d.getTime())) return iso;
  }

  // MM/DD/YYYY (US format — try if DD > 12 doesn't work)
  const mdyMatch = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (mdyMatch) {
    const [, month, day, year] = mdyMatch;
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    if (monthNum <= 12 && dayNum <= 31) {
      const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      const d = new Date(iso + "T00:00:00");
      if (!isNaN(d.getTime())) return iso;
    }
  }

  // Try native Date.parse as fallback for strings like "Feb 17, 2026", "17 Feb 2026"
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    if (y >= 2000 && y <= 2100) {
      return `${y}-${m}-${d}`;
    }
  }

  return null;
}

/**
 * Validate a date field value.
 * Returns the normalized ISO date or an error.
 */
export function validateDate(input: string, fieldLabel: string): ValidationResult {
  const iso = parseDate(input);
  if (!iso) {
    return {
      valid: false,
      error: `"${input}" doesn't look like a valid date. Please use a format like YYYY-MM-DD, DD/MM/YYYY, or "17 Feb 2026".`,
    };
  }
  return { valid: true, value: iso };
}

/**
 * Parse a budget/money string into a number.
 * Accepts: "50000", "$50,000", "50k", "$1.5m", "1,500,000", etc.
 * Returns null if unparseable.
 */
export function parseBudget(input: string): number | null {
  let trimmed = input.trim();
  if (!trimmed) return null;

  // Remove currency symbols and spaces
  trimmed = trimmed.replace(/^\$|^NZ\$|^USD|^AUD|^€|^£/i, "").trim();

  // Handle "k" suffix (e.g. "50k" → 50000)
  const kMatch = trimmed.match(/^([\d,.]+)\s*k$/i);
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(/,/g, ""));
    if (!isNaN(num)) return num * 1000;
  }

  // Handle "m" suffix (e.g. "1.5m" → 1500000)
  const mMatch = trimmed.match(/^([\d,.]+)\s*m$/i);
  if (mMatch) {
    const num = parseFloat(mMatch[1].replace(/,/g, ""));
    if (!isNaN(num)) return num * 1000000;
  }

  // Remove commas and parse
  const cleaned = trimmed.replace(/,/g, "");
  const num = parseFloat(cleaned);
  if (!isNaN(num) && num >= 0) return num;

  return null;
}

/**
 * Validate a budget field value.
 * Returns the normalized number or an error.
 */
export function validateBudget(input: string): ValidationResult {
  const num = parseBudget(input);
  if (num === null) {
    return {
      valid: false,
      error: `"${input}" doesn't look like a valid budget amount. Try something like "50000", "$50,000", or "50k".`,
    };
  }
  return { valid: true, value: num };
}

/**
 * Validate that end date is after start date.
 * Both must be ISO YYYY-MM-DD strings.
 */
export function validateEndDateAfterStart(
  startDate: string,
  endDate: string
): ValidationResult {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: true, value: endDate };
  }

  if (end < start) {
    return {
      valid: false,
      error: `End date (${endDate}) is before start date (${startDate}). Please pick a date after the start date.`,
    };
  }

  return { valid: true, value: endDate };
}

/**
 * Validate all collected data before project creation.
 * Returns array of error messages (empty = all valid).
 */
export function validateCollectedData(
  collectedData: Record<string, unknown>
): string[] {
  const errors: string[] = [];

  const name = collectedData.name;
  if (!name || String(name).trim().length === 0) {
    errors.push("Project name is required.");
  }

  const client = collectedData.client;
  if (!client || String(client).trim().length === 0) {
    errors.push("Client is required.");
  }

  const startDate = collectedData.startDate;
  if (!startDate || String(startDate).trim().length === 0) {
    errors.push("Start date is required.");
  } else {
    const parsed = parseDate(String(startDate));
    if (!parsed) {
      errors.push(`Start date "${startDate}" is not a valid date.`);
    }
  }

  const endDate = collectedData.endDate;
  if (endDate && String(endDate).trim()) {
    const parsedEnd = parseDate(String(endDate));
    if (!parsedEnd) {
      errors.push(`End date "${endDate}" is not a valid date.`);
    } else if (startDate) {
      const parsedStart = parseDate(String(startDate));
      if (parsedStart) {
        const result = validateEndDateAfterStart(parsedStart, parsedEnd);
        if (!result.valid) {
          errors.push(result.error);
        }
      }
    }
  }

  const budget = collectedData.budget;
  if (budget != null && String(budget).trim()) {
    if (typeof budget === "string") {
      const parsed = parseBudget(budget);
      if (parsed === null) {
        errors.push(`Budget "${budget}" is not a valid amount.`);
      }
    }
  }

  return errors;
}

const VALID_BUSINESS_CONTACT_ROLES = ["client", "supplier", "subcontractor"];

/**
 * Validate all collected data before contact creation.
 * Returns array of error messages (empty = all valid).
 */
export function validateBusinessContactCollectedData(
  collectedData: Record<string, unknown>
): string[] {
  const errors: string[] = [];

  const name = collectedData.name;
  if (!name || String(name).trim().length === 0) {
    errors.push("Contact name is required.");
  }

  const roles = collectedData.roles;
  const rolesArr = Array.isArray(roles) ? roles : [];
  if (rolesArr.length === 0) {
    errors.push("At least one role is required (Client, Supplier, or Subcontractor).");
  } else {
    const invalid = rolesArr.filter(
      (r) => !VALID_BUSINESS_CONTACT_ROLES.includes(String(r).trim().toLowerCase())
    );
    if (invalid.length > 0) {
      errors.push(`Invalid role(s): ${invalid.join(", ")}. Must be: client, supplier, subcontractor.`);
    }
  }

  const email = collectedData.email;
  if (!email || String(email).trim().length === 0) {
    errors.push("Email is required.");
  } else if (!isValidEmail(String(email).trim())) {
    errors.push("Email must be a valid email address.");
  }

  return errors;
}
