/**
 * AI document-import constants & helpers — shared between server routes and
 * client components. Kept dependency-free so client bundles can import it.
 */

/** Max upload size for AI document import (PDFs/images). */
export const AI_IMPORT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** Max rows the model may extract from one document. */
export const AI_IMPORT_MAX_ROWS = 200;

/** Accepted upload media types → file extensions. */
export const AI_IMPORT_MEDIA_TYPES: Readonly<Record<string, string>> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

/** The file-input `accept` string for the AI import picker. */
export const AI_IMPORT_ACCEPT = Object.entries(AI_IMPORT_MEDIA_TYPES)
  .flatMap(([mime, ext]) => [mime, ext])
  .join(',');

/**
 * Resolve a file's media type, falling back to its extension when the browser
 * sends a blank or generic MIME type.
 */
export function resolveAiMediaType(name: string, type: string): string | null {
  if (type && AI_IMPORT_MEDIA_TYPES[type]) return type;
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}
