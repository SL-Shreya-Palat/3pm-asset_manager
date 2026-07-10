import { formatDate } from '@/lib/utils';

interface FormattedDateProps {
  /** The date to display — Date, ISO string, timestamp, or null/undefined. */
  value: string | Date | number | null | undefined;
  /** Text shown when there is no valid date (defaults to an em dash). */
  fallback?: string;
  className?: string;
}

/**
 * Canonical date display for the app. Renders a date in the standard
 * "28 Jul 2026" format (matching the form date pickers) via `formatDate`.
 * Use this everywhere a date is shown so the format stays consistent.
 */
export function FormattedDate({ value, fallback = '—', className }: FormattedDateProps) {
  const formatted = formatDate(value);
  return <span className={className}>{formatted === '—' ? fallback : formatted}</span>;
}
