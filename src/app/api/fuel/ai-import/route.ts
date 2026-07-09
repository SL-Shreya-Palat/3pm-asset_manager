/**
 * POST /api/fuel/ai-import — AI-powered fuel import from PDF/image.
 *
 * Accepts a multipart upload of a PDF or image file. The AI vision model
 * classifies the document and extracts fuel transaction rows, then the
 * rows are DRY-RUN validated through the same engine as the Excel import.
 *
 * Nothing is inserted — the client shows an editable preview and confirms
 * via POST /api/fuel/import-rows.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { authorize } from '@/lib/authz';
import { isAiConfigured } from '@/lib/buddy-ai/provider';
import { AI_IMPORT_MAX_BYTES, resolveAiMediaType } from '@/lib/data-io/ai-import';
import { extractFuelRowsFromDocument, FUEL_EXTRACT_HEADERS } from '@/lib/data-io/ai-extract-fuel';
import { buildAssetLookup, buildDriverLookup, validateFuelRows } from '@/lib/data-io/fuel-validate';
import type { AiFuelImportPreview } from '@/lib/data-io/types';

// Vision extraction on a multi-page PDF can exceed the default timeout.
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const auth = await authorize(request, 'fuel.fuel.fuelEntry', 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  if (!isAiConfigured()) {
    return NextResponse.json(
      { data: null, error: 'AI import is not available — no AI provider is configured.' },
      { status: 503 },
    );
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ data: null, error: 'No file uploaded' }, { status: 400 });
    }

    if (file.size > AI_IMPORT_MAX_BYTES) {
      return NextResponse.json(
        { data: null, error: 'File is too large — the limit is 10 MB.' },
        { status: 400 },
      );
    }

    const mediaType = resolveAiMediaType(file.name, file.type);
    if (!mediaType) {
      return NextResponse.json(
        { data: null, error: 'Unsupported file type. Upload a PDF, PNG, JPG or WebP.' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extraction = await extractFuelRowsFromDocument({
      buffer,
      mediaType,
      filename: file.name,
    });

    // Dry-run validation when the AI found fuel data
    let validation: AiFuelImportPreview['validation'] = null;
    if (extraction.matchesModule) {
      const tenantOid = ObjectId.createFromHexString(user.currentTenantId!);
      const userOid = ObjectId.createFromHexString(user.id);
      const batchId = `ai_import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const [assetMap, driverMap] = await Promise.all([
        buildAssetLookup(tenantOid),
        buildDriverLookup(tenantOid),
      ]);

      const { ready, errors } = validateFuelRows(
        extraction.rows,
        assetMap,
        driverMap,
        tenantOid,
        userOid,
        batchId,
      );

      validation = {
        totalRows: extraction.rows.length,
        readyRows: ready.length,
        errors,
      };
    }

    const preview: AiFuelImportPreview = {
      matchesModule: extraction.matchesModule,
      detectedType: extraction.detectedType,
      confidence: extraction.confidence,
      headers: FUEL_EXTRACT_HEADERS,
      rows: extraction.rows,
      validation,
    };

    return NextResponse.json({ data: preview, error: null });
  } catch (err) {
    console.error('AI import error', err);
    return NextResponse.json(
      {
        data: null,
        error: "The AI couldn't read this document. Please try again or use the Excel import.",
      },
      { status: 500 },
    );
  }
}
