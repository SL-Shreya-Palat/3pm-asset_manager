/**
 * POST /api/drivers/extract-licence
 *
 * Accepts a driver licence photo and extracts structured fields with a single
 * vision call. Uses the SHARED AI provider (`getExtractModel`) + `generateObject`
 * — the same path as fuel extraction — so it runs on whatever model is
 * configured (currently `openai/gpt-4o-mini` via OpenRouter) and stays
 * consistent with the rest of the app's AI. No provider-specific SDK here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateObject } from 'ai';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getExtractModel, isAiConfigured } from '@/lib/buddy-ai/provider';

// Buffer + AI SDK file parts → Node runtime, not edge.
export const runtime = 'nodejs';

const licenceSchema = z.object({
  isLicence: z
    .boolean()
    .describe('true only if the image is a driver licence / driving licence card from any country'),
  firstName: z.string().describe('given/first name(s) of the licence holder; empty string if not readable'),
  lastName: z.string().describe('surname/family name of the licence holder; empty string if not readable'),
  dateOfBirth: z.string().describe('date of birth in YYYY-MM-DD format; empty string if not found'),
  licenseNumber: z.string().describe('the primary licence/document number; empty string if not readable'),
  licenseClass: z
    .string()
    .describe('the licence class(es)/category(ies) shown, e.g. "C", "B, BE", "1, 2"; empty string if not shown'),
  cardVersion: z.string().describe('the card/document version number if visible; empty string otherwise'),
});

const PROMPT = [
  'Analyse the attached image. First determine whether it is a driver licence / driving licence card from any country.',
  '- If it is NOT a driver licence, set isLicence=false and leave every other field as an empty string.',
  '- If it IS a driver licence, set isLicence=true and extract the fields.',
  'Copy values exactly as written; fix only casing/spacing. NEVER invent a value — leave a field as an empty string if it is not visible or not readable.',
].join('\n');

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      {
        data: null,
        error: 'AI is not configured — set OPENAI_API_KEY, OPENROUTER_API_KEY, or GOOGLE_GENAI_API_KEY.',
      },
      { status: 500 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ data: null, error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mediaType = file.type || 'image/jpeg';

    const { object } = await generateObject({
      model: getExtractModel(),
      schema: licenceSchema,
      maxRetries: 2,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'file', data: buffer, mediaType, filename: file.name || 'licence' },
          ],
        },
      ],
    });

    if (!object.isLicence) {
      return NextResponse.json(
        {
          data: null,
          error:
            'The uploaded image does not appear to be a driver licence. Please upload a valid driver licence photo.',
        },
        { status: 400 },
      );
    }

    // Same response contract as before (driver-form reads these keys directly).
    const data = {
      firstName: object.firstName.trim(),
      lastName: object.lastName.trim(),
      dateOfBirth: object.dateOfBirth.trim(),
      licenseNumber: object.licenseNumber.trim(),
      licenseClass: object.licenseClass.trim(),
      cardVersion: object.cardVersion.trim(),
    };
    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[extract-licence] AI extraction failed:', err);
    return NextResponse.json(
      { data: null, error: 'Failed to extract licence details from image' },
      { status: 500 },
    );
  }
}
