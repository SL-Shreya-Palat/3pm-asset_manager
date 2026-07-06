import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string for display, matching the construction portal format.
 * Output example: "6 Jul 2025"
 */
export function formatDate(
  date: string | Date | number | null | undefined,
): string {
  if (!date) return '—';
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '—';
  return dateObj.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Return today's date as a "yyyy-MM-dd" string (local timezone). */
export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
