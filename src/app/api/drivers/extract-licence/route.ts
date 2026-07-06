/**
 * POST /api/drivers/extract-licence
 * Accepts a driver licence photo and uses Google Gemini vision
 * to extract structured fields from the image.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { data: null, error: 'Google Gemini API key is not configured' },
      { status: 500 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ data: null, error: 'No file provided' }, { status: 400 });
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mimeType = file.type || 'image/jpeg';

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64,
          mimeType,
        },
      },
      {
        text: `Analyse this image. First determine if it is a driver licence / driving license card from any country.

If the image is NOT a driver licence, return ONLY this JSON:
{"isLicence": false}

If the image IS a driver licence, extract the following fields and return ONLY this JSON:
{
  "isLicence": true,
  "firstName": "",
  "lastName": "",
  "dateOfBirth": "",
  "licenseNumber": "",
  "licenseClass": "",
  "cardVersion": ""
}

Rules:
- "firstName" is the given/first name(s) of the licence holder.
- "lastName" is the surname/family name of the licence holder.
- "dateOfBirth" must be in YYYY-MM-DD format if found.
- "licenseNumber" is the primary licence/document number.
- "licenseClass" should contain the licence class(es) or category(ies) shown (e.g. "C", "B, BE", "1, 2").
- "cardVersion" is the card version or document version number if visible.
- If a field is not visible or not readable, leave it as an empty string.
- Return ONLY the JSON object, no markdown, no explanation.`,
      },
    ]);

    const text = result.response.text().trim();

    // Parse the JSON response — strip markdown fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const extracted = JSON.parse(cleaned);

    if (!extracted.isLicence) {
      return NextResponse.json(
        { data: null, error: 'The uploaded image does not appear to be a driver licence. Please upload a valid driver licence photo.' },
        { status: 400 },
      );
    }

    const { isLicence: _, ...fields } = extracted;
    return NextResponse.json({ data: fields, error: null });
  } catch (err) {
    console.error('[extract-licence] Gemini extraction failed:', err);
    return NextResponse.json(
      { data: null, error: 'Failed to extract licence details from image' },
      { status: 500 },
    );
  }
}
