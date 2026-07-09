/**
 * POST /api/fuel/import-rows — Import user-confirmed fuel rows (from AI preview).
 *
 * Accepts a JSON body with the reviewed/edited rows and runs them through the
 * same validation + insert pipeline as the Excel import. This is the "Phase 2"
 * endpoint called after the user reviews the AI extraction preview.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { authorize } from '@/lib/authz';
import { getFuelTransactionsCollection } from '@/lib/mongodb';
import { AI_IMPORT_MAX_ROWS } from '@/lib/data-io/ai-import';
import { buildAssetLookup, buildDriverLookup, validateFuelRows } from '@/lib/data-io/fuel-validate';
import type { ImportResult, RowError } from '@/lib/data-io/types';

export async function POST(request: NextRequest) {
  const auth = await authorize(request, 'fuel.fuel.fuelEntry', 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const body = await request.json();
    const rows: Record<string, string>[] = body.rows;
    const proceedValidOnly: boolean = body.proceedValidOnly === true;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ data: null, error: 'No rows provided' }, { status: 400 });
    }

    if (rows.length > AI_IMPORT_MAX_ROWS) {
      return NextResponse.json(
        { data: null, error: `Maximum ${AI_IMPORT_MAX_ROWS} rows per import` },
        { status: 400 },
      );
    }

    const tenantOid = ObjectId.createFromHexString(user.currentTenantId!);
    const userOid = ObjectId.createFromHexString(user.id);
    const importBatchId = `ai_import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const [assetMap, driverMap] = await Promise.all([
      buildAssetLookup(tenantOid),
      buildDriverLookup(tenantOid),
    ]);

    // -- Phase 1: Validate --
    const { ready, errors } = validateFuelRows(
      rows,
      assetMap,
      driverMap,
      tenantOid,
      userOid,
      importBatchId,
    );

    // Phase 1 gate
    if (errors.length > 0 && !proceedValidOnly) {
      const result: ImportResult = {
        totalRows: rows.length,
        success: 0,
        failed: errors.length,
        readyRows: ready.length,
        errors,
      };
      return NextResponse.json({ data: result, error: null });
    }

    // -- Phase 2: Insert valid rows --
    const collection = await getFuelTransactionsCollection();
    let success = 0;
    const insertErrors: RowError[] = [];

    for (const { row, doc } of ready) {
      try {
        await collection.insertOne(doc);
        success++;
      } catch {
        insertErrors.push({ row, errors: ['Database insert failed'] });
      }
    }

    const allErrors = [...errors, ...insertErrors];
    const result: ImportResult = {
      totalRows: rows.length,
      success,
      failed: allErrors.length,
      readyRows: ready.length,
      errors: allErrors,
    };

    return NextResponse.json(
      { data: result, error: null },
      { status: success > 0 ? 201 : 200 },
    );
  } catch (err) {
    console.error('Import-rows error:', err);
    return NextResponse.json({ data: null, error: 'Failed to import rows' }, { status: 400 });
  }
}
