/**
 * Spreadsheet helpers for import/export, adapted from the dispatch portal's
 * data-io system. Builds templates + exports, parses uploaded workbooks, and
 * strips the Notes instruction block that templates include.
 */
import * as XLSX from 'xlsx';

/** Column definition for template/export generation. */
export interface FuelColumn {
  /** Human header shown in the sheet (e.g. "Total Cost"). */
  header: string;
  /** Record field this column maps to (e.g. "totalCost"). */
  field: string;
  /** Required on import (shown in template notes). */
  required?: boolean;
  /** Sample value placed in the template's example rows. */
  example?: string;
  /** Allowed values (shown in template notes). */
  enum?: readonly string[];
  /** Included in templates + import, but omitted from exports. */
  importOnly?: boolean;
}

const NOTES_MARKER = 'notes';

/** Normalize a header for tolerant matching ("Contact Name" -> "contactname"). */
export function normalizeHeader(h: string): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Drop the trailing Notes/instructions block and any fully-blank rows. */
export function stripNotesSection(rows: unknown[][]): unknown[][] {
  const cut = rows.findIndex((r) => {
    const first = String(r?.[0] ?? '').trim().toLowerCase();
    const rest = (r ?? []).slice(1).every((c) => String(c ?? '').trim() === '');
    return rest && (first === NOTES_MARKER || first === `${NOTES_MARKER}:` || first.startsWith('notes '));
  });
  const sliced = cut >= 0 ? rows.slice(0, cut) : rows;
  return sliced.filter((r) => (r ?? []).some((c) => String(c ?? '').trim() !== ''));
}

/** A parsed sheet: the header row + each data row as a header->value object. */
export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

/** Read the first worksheet of a buffer into header + keyed rows. */
export function parseWorkbook(buffer: Buffer): ParsedSheet {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
  const clean = stripNotesSection(aoa);
  if (!clean.length) return { headers: [], rows: [] };

  const headers = (clean[0] as unknown[]).map((h) => String(h ?? '').trim());
  const rows = clean.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = String((r as unknown[])[i] ?? '').trim();
    });
    return obj;
  });
  return { headers, rows };
}

/** Build a downloadable .xlsx template: headers + example rows + Notes block. */
export function buildTemplate(
  label: string,
  columns: FuelColumn[],
  extraNotes?: string[],
): Buffer {
  const headers = columns.map((c) => c.header);
  const example = columns.map((c) => c.example ?? '');

  const notes: unknown[][] = [
    [],
    ['NOTES'],
    ['Delete the example rows above before importing.'],
    [`Required columns: ${columns.filter((c) => c.required).map((c) => c.header).join(', ') || 'none'}.`],
  ];
  for (const c of columns) {
    if (c.enum) notes.push([`${c.header}: one of ${c.enum.join(', ')}.`]);
  }
  for (const line of extraNotes ?? []) notes.push([line]);

  const aoa: unknown[][] = [headers, example, example.map(() => ''), ...notes];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, label.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Build a downloadable export workbook from columns + already-formatted rows. */
export function buildExport(
  label: string,
  columns: FuelColumn[],
  rows: Record<string, string | number | null>[],
  format: 'xlsx' | 'csv' = 'xlsx',
): Buffer {
  const cols = columns.filter((c) => !c.importOnly);
  const headers = cols.map((c) => c.header);
  const aoa: unknown[][] = [
    headers,
    ...rows.map((r) => cols.map((c) => r[c.field] ?? '')),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return Buffer.from(csv, 'utf-8');
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, label.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
