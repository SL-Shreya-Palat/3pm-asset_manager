/**
 * POST /api/drivers/extract-licence
 * Accepts a driver licence photo and uses the configured AI provider
 * (OpenRouter / OpenAI / Google) to extract structured fields from the image.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getExtractModel, isAiConfigured } from '@/lib/buddy-ai/provider';

const licenceSchema = z.object({
  isLicence: z.boolean().describe('true only if the image is a driver licence / driving license card'),
  firstName: z.string().describe('Given/first name(s) of the licence holder — empty string if not visible'),
  lastName: z.string().describe('Surname/family name of the licence holder — empty string if not visible'),
  dateOfBirth: z.string().describe('Date of birth in YYYY-MM-DD format — empty string if not visible'),
  licenseNumber: z.string().describe('Primary licence/document number — empty string if not visible'),
  licenseClass: z.string().describe('Licence class(es) or category(ies) shown (e.g. "C", "B, BE") — empty string if not visible'),
  cardVersion: z.string().describe('Card/document version number — empty string if not visible'),
});

const PROMPT = `Analyse this image. Determine if it is a driver licence / driving license card from any country.

If the image is NOT a driver licence, set isLicence to false and leave all other fields as empty strings.

If the image IS a driver licence, set isLicence to true and extract the fields.

Rules:
- "firstName" is the given/first name(s) of the licence holder.
- "lastName" is the surname/family name of the licence holder.
- "dateOfBirth" must be in YYYY-MM-DD format if found.
- "licenseNumber" is the primary licence/document number.
- "licenseClass" should contain the licence class(es) or category(ies) shown (e.g. "C", "B, BE", "1, 2").
- "cardVersion" is the card version or document version number if visible.
- If a field is not visible or not readable, leave it as an empty string.`;

export async function POST(request: NextRequest) {
  const auth = await authorize(request, 'people.drivers.driver', 'create');
  if (!auth.ok) return auth.res;

  if (!isAiConfigured()) {
    return NextResponse.json(
      { data: null, error: 'No AI provider is configured. Set OPENAI_API_KEY, OPENROUTER_API_KEY, or GOOGLE_GENAI_API_KEY.' },
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
    const mimeType = file.type || 'image/jpeg';

    const { object: extracted } = await generateObject({
      model: getExtractModel(),
      schema: licenceSchema,
      maxRetries: 2,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'file', data: buffer, mediaType: mimeType },
          ],
        },
      ],
    });

    if (!extracted.isLicence) {
      return NextResponse.json(
        { data: null, error: 'The uploaded image does not appear to be a driver licence. Please upload a valid driver licence photo.' },
        { status: 400 },
      );
    }

    const { isLicence: _, ...fields } = extracted;
    return NextResponse.json({ data: fields, error: null });
  } catch (err: any) {
    console.error('[extract-licence] extraction failed:', err);
    return NextResponse.json(
      { data: null, error: `Failed to extract licence details from image: ${err?.message ?? 'Unknown error'}` },
      { status: 500 },
    );
  }
}
