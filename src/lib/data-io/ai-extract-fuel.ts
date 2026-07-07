/**
 * AI document extraction for fuel transactions.
 *
 * Given an uploaded PDF/image, a single vision call classifies the document
 * and extracts rows in the fuel template's shape (header → value strings).
 *
 * The model NEVER touches the database — its rows feed the same deterministic
 * validation pipeline as an Excel import (`validateFuelRows`), which handles
 * lookups, type coercion, and inserts.
 */
import { z } from 'zod';
import { generateObject } from 'ai';
import { getExtractModel } from '@/lib/buddy-ai/provider';
import { FUEL_TYPES } from '@/controller/fuel/types';
import { AI_IMPORT_MAX_ROWS } from './ai-import';

// ── Extraction result ──

export interface AiFuelExtraction {
  matchesModule: boolean;
  detectedType: string;
  confidence: number;
  /** Rows keyed by column HEADER (e.g. "Asset", "Total Cost"). */
  rows: Record<string, string>[];
}

// ── Column metadata for the prompt & schema ──

interface ExtractColumn {
  header: string;
  required: boolean;
  hint: string;
}

const FUEL_EXTRACT_COLUMNS: ExtractColumn[] = [
  { header: 'Asset', required: true, hint: 'the vehicle/equipment name exactly as written' },
  { header: 'Driver', required: false, hint: "the driver's full name if shown" },
  { header: 'Date', required: true, hint: 'in YYYY-MM-DD format when possible' },
  { header: 'Time', required: false, hint: 'in HH:MM format if present' },
  { header: 'Volume', required: true, hint: 'a plain number (gallons or liters)' },
  { header: 'Unit Cost', required: false, hint: 'price per unit of fuel' },
  { header: 'Total Cost', required: true, hint: 'total cost of the fill-up' },
  { header: 'Fuel Type', required: false, hint: `one of: ${FUEL_TYPES.join(', ')}` },
  { header: 'Start Mileage', required: false, hint: 'odometer reading before fill-up' },
  { header: 'End Mileage', required: false, hint: 'odometer reading after fill-up' },
  { header: 'Station', required: false, hint: 'name of the fuel station or vendor' },
  { header: 'Notes', required: false, hint: 'any notes or comments' },
];

/** The canonical template headers, in order. */
export const FUEL_EXTRACT_HEADERS = FUEL_EXTRACT_COLUMNS.map((c) => c.header);

// ── Schema ──

function buildExtractionSchema() {
  const shape: Record<string, z.ZodType<string>> = {};
  for (const col of FUEL_EXTRACT_COLUMNS) {
    shape[col.header] = z
      .string()
      .describe(
        `${col.header}${col.required ? ' (required)' : ''} — empty string if not present in the document. Never invent a value.`,
      );
  }

  return z.object({
    matchesModule: z
      .boolean()
      .describe('true only if the document actually contains fuel transaction data'),
    detectedType: z
      .string()
      .max(60)
      .describe('What kind of document this is, as a label of at most 4 words — never a sentence'),
    confidence: z.number().min(0).max(1).describe('Your confidence in the extraction, 0 to 1'),
    rows: z
      .array(z.object(shape))
      .max(AI_IMPORT_MAX_ROWS)
      .describe('Extracted fuel transaction rows; empty array if matchesModule is false'),
  });
}

// ── Prompt ──

function describeColumn(col: ExtractColumn): string {
  const parts: string[] = [];
  if (col.required) parts.push('required');
  parts.push(col.hint);
  return `- "${col.header}" (${parts.join('; ')})`;
}

function buildPrompt(): string {
  return [
    'You are a precise data-entry assistant for a fleet/asset management system.',
    'Read the attached document and extract fuel transaction records from it.',
    '',
    'About fuel transactions:',
    '- A fuel transaction records fuel purchased for a vehicle or piece of equipment.',
    '- Typical sources: fuel receipts, gas station receipts, fleet fuel reports, fuel card statements (WEX, Fleetcor, Coast), bulk fuel delivery tickets.',
    '- Asset is the vehicle/equipment name exactly as it appears — it will be matched against existing assets in the system.',
    '- Driver is the person who filled up, if shown.',
    '- If both Unit Cost and Total Cost are present, extract both.',
    '',
    'Columns to fill for each record:',
    ...FUEL_EXTRACT_COLUMNS.map(describeColumn),
    '',
    'Rules:',
    '- One row per distinct fuel transaction. Deduplicate obvious repeats.',
    '- Copy values as written; fix only casing/spacing. NEVER guess or fabricate a value — leave the field as an empty string instead.',
    '- If a value is partially unreadable, leave it blank rather than approximating.',
    '- Set matchesModule=true ONLY if the document contains at least one genuine fuel transaction record — real data across the columns above. A bare name, logo, letterhead, branding, or placeholder/dummy content with no actual record details is NOT fuel data: set matchesModule=false for those.',
    '- If the document does not contain fuel transaction data, set matchesModule=false, describe what it actually is in detectedType, and return no rows.',
  ].join('\n');
}

// ── Extraction ──

/**
 * Classify + extract in a single vision call. Images and PDFs are both sent
 * as file parts; for PDFs via OpenRouter, the file-parser plugin OCRs pages
 * for models without native PDF input.
 */
export async function extractFuelRowsFromDocument(file: {
  buffer: Buffer;
  mediaType: string;
  filename: string;
}): Promise<AiFuelExtraction> {
  const isPdf = file.mediaType === 'application/pdf';
  const isOpenRouter = Boolean(
    !process.env.OPENAI_API_KEY && process.env.OPENROUTER_API_KEY,
  );

  const { object } = await generateObject({
    model: getExtractModel(),
    schema: buildExtractionSchema(),
    maxRetries: 2,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt() },
          { type: 'file', data: file.buffer, mediaType: file.mediaType, filename: file.filename },
        ],
      },
    ],
    // OpenRouter needs the file-parser plugin for PDF OCR; OpenAI and Google
    // handle PDFs natively.
    providerOptions:
      isPdf && isOpenRouter
        ? {
            openrouter: {
              plugins: [
                {
                  id: 'file-parser',
                  pdf: { engine: process.env.OPENROUTER_PDF_ENGINE || 'mistral-ocr' },
                },
              ],
            },
          }
        : undefined,
  });

  // Trim every cell so downstream matching/validation sees clean values.
  const rows = object.rows.map((row) => {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) clean[k] = String(v ?? '').trim();
    return clean;
  });

  return {
    matchesModule: object.matchesModule && rows.length > 0,
    detectedType: object.detectedType.trim() || 'document',
    confidence: Math.min(1, Math.max(0, object.confidence)),
    rows: object.matchesModule ? rows : [],
  };
}
