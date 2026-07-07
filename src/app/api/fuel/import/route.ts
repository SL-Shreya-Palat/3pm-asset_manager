/**
 * POST /api/fuel/import -- Import fuel transactions from CSV/XLS/XLSX file upload
 *
 * Two-phase import (adapted from dispatch portal pattern):
 *   Phase 1: Validate all rows, collect errors, build ready documents.
 *            If errors exist and proceedValidOnly=false → return errors, no insert.
 *   Phase 2: Insert only the rows that passed validation.
 *
 * Accepts multipart/form-data with a "file" field and optional "proceedValidOnly" flag.
 */
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getFuelTransactionsCollection } from '@/lib/mongodb';
import { buildAssetLookup, buildDriverLookup, validateFuelRows } from '@/lib/data-io/fuel-validate';
import type { ImportResult, RowError } from '@/lib/data-io/types';

const ALLOWED_MIME_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
];

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const proceedValidOnly = formData.get('proceedValidOnly') === 'true';

    if (!file) {
      return NextResponse.json({ data: null, error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const fileName = file.name || '';
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { data: null, error: `Invalid file type. Accepted formats: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 },
      );
    }

    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type) && file.type !== 'application/octet-stream') {
      return NextResponse.json(
        { data: null, error: `Invalid file type. Accepted formats: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 },
      );
    }

    // Parse file with xlsx
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
    }) as unknown[][];

    if (!rawData || rawData.length < 2) {
      return NextResponse.json(
        { data: null, error: 'File is empty or has no data rows (needs a header row + at least 1 data row)' },
        { status: 400 },
      );
    }

    // Convert array-of-arrays to header-keyed rows for shared validation
    const headerRow = (rawData[0] as unknown[]).map((h) => String(h ?? '').trim());
    const dataRows = rawData.slice(1).filter((row) => row.some((cell) => cell !== ''));

    if (dataRows.length === 0) {
      return NextResponse.json(
        { data: null, error: 'No data rows found in file' },
        { status: 400 },
      );
    }

    if (dataRows.length > 500) {
      return NextResponse.json(
        { data: null, error: 'Maximum 500 rows per import' },
        { status: 400 },
      );
    }

    // Convert each array row to a header-keyed object
    const keyedRows: Record<string, string>[] = dataRows.map((row) => {
      const obj: Record<string, string> = {};
      headerRow.forEach((h, idx) => {
        const v = (row as unknown[])[idx];
        // Preserve Date objects from xlsx cellDates as ISO strings
        if (v instanceof Date) {
          obj[h] = v.toISOString();
        } else {
          obj[h] = v != null && v !== '' ? String(v).trim() : '';
        }
      });
      return obj;
    });

    // Build lookup maps and validate
    const tenantOid = ObjectId.createFromHexString(user.currentTenantId);
    const [assetNameMap, driverNameMap] = await Promise.all([
      buildAssetLookup(tenantOid),
      buildDriverLookup(tenantOid),
    ]);

    const userOid = ObjectId.createFromHexString(user.id);
    const importBatchId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // ── Phase 1: Validate all rows ──
    const { ready, errors } = validateFuelRows(
      keyedRows, assetNameMap, driverNameMap, tenantOid, userOid, importBatchId,
    );

    // Phase 1 gate: if errors exist and caller hasn't opted to proceed with valid only,
    // return the validation result without inserting anything.
    if (errors.length > 0 && !proceedValidOnly) {
      const result: ImportResult = {
        totalRows: dataRows.length,
        success: 0,
        failed: errors.length,
        readyRows: ready.length,
        errors,
      };
      return NextResponse.json({ data: result, error: null }, { status: 200 });
    }

    // ── Phase 2: Insert valid rows ──
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
      totalRows: dataRows.length,
      success,
      failed: allErrors.length,
      readyRows: ready.length,
      errors: allErrors,
    };

    return NextResponse.json({
      data: result,
      error: null,
    }, { status: success > 0 ? 201 : 200 });
  } catch (err) {
    console.error('Fuel import error:', err);
    return NextResponse.json({ data: null, error: 'Failed to process file' }, { status: 400 });
  }
}
