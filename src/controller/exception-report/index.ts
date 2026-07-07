/**
 * Exception Report (calendar view) — computed ON THE FLY from inspection
 * submissions. No stored per-day status collection.
 *
 * Rows are derived from REAL inspection activity: a form appears under an asset
 * only if that asset has actually submitted it within the lookback window. That
 * makes an empty ("missed") day meaningful — a genuine gap in a form the asset
 * normally does — rather than painting every form×asset combo as missed.
 *
 * We take one pass over submissions in [lookbackStart, rangeEnd]:
 *   • lookback establishes which (asset, form) pairs are "active" (so a fully
 *     skipped week still shows a row of missed cells);
 *   • only submissions whose LOCAL day falls in the visible range colour a cell.
 *
 * "Local day" uses the caller's timezone offset (minutes, as from
 * Date.prototype.getTimezoneOffset) so buckets line up with the calendar the
 * user sees — not UTC (which would shift e.g. NZ afternoons a column earlier).
 */
import { ObjectId } from 'mongodb';
import {
  getAssetsCollection,
  getInspectionSubmissionsCollection,
} from '@/lib/mongodb';
import type {
  ExceptionReportData,
  ExceptionAssetRow,
  ExceptionCell,
} from '@/components/inspections/exception-report-types';

/** Hard cap on assets (rows) returned — keeps the grid renderable; surfaced in meta. */
const ASSET_CAP = 150;
/** How far back to look to decide an (asset, form) pair is "active". */
const LOOKBACK_DAYS = 90;
const DAY_MS = 86_400_000;

export interface ExceptionReportOptions {
  /** Inclusive range, `yyyy-MM-dd`. */
  from: string;
  to: string;
  /** Restrict to these forms (hex ids). Empty/undefined = all forms. */
  formIds?: string[];
  /** Restrict assets to these teams (hex ids). Empty/undefined = all teams. */
  teamIds?: string[];
  /** Caller timezone offset in minutes (Date.getTimezoneOffset()). Default 0 (UTC). */
  tzOffsetMinutes?: number;
}

/** `yyyy-MM-dd` for a Date shifted into the caller's local timezone. */
function localDayKey(date: Date, tzOffsetMinutes: number): string {
  return new Date(date.getTime() - tzOffsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** Ordered list of `yyyy-MM-dd` from `from` to `to` inclusive (UTC-stepped). */
function buildDayColumns(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return days;
  // Guard against an accidental huge range (max ~1 year of columns).
  for (let t = start, i = 0; t <= end && i < 366; t += DAY_MS, i++) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

interface Bucket {
  count: number;
  defectCount: number;
  hasFail: boolean;
  submissionId: string;
  inspectionNumber: string | null;
  at: number;
}

export async function getExceptionReport(
  tenantId: string,
  options: ExceptionReportOptions,
): Promise<ExceptionReportData> {
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const tz = options.tzOffsetMinutes ?? 0;
  const days = buildDayColumns(options.from, options.to);
  const daySet = new Set(days);
  const today = localDayKey(new Date(), tz);

  const empty: ExceptionReportData = {
    from: options.from,
    to: options.to,
    days,
    today,
    assets: [],
    meta: { assetCount: 0, formCount: 0, truncated: false, assetCap: ASSET_CAP },
  };
  if (days.length === 0) return empty;

  const fromMs = new Date(`${options.from}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${options.to}T00:00:00.000Z`).getTime();
  // ±1–2 days of slack so timezone shifting can't drop edge-of-range submissions.
  const rangeStart = fromMs - LOOKBACK_DAYS * DAY_MS;
  const rangeEnd = toMs + 2 * DAY_MS;

  const formOids = (options.formIds || [])
    .filter((id) => ObjectId.isValid(id))
    .map((id) => ObjectId.createFromHexString(id));
  const teamOids = (options.teamIds || [])
    .filter((id) => ObjectId.isValid(id))
    .map((id) => ObjectId.createFromHexString(id));

  // ── One pass over submissions: establish active pairs + colour range cells ──
  const subsCol = await getInspectionSubmissionsCollection();
  const subFilter: Record<string, unknown> = {
    tenantId: tenantOid,
    assetId: { $ne: null },
    submittedAt: { $gte: new Date(rangeStart), $lte: new Date(rangeEnd) },
  };
  subFilter.formId = formOids.length ? { $in: formOids } : { $ne: null };

  const cursor = subsCol
    .find(subFilter)
    .project({ assetId: 1, formId: 1, formTitle: 1, submittedAt: 1, result: 1, defects: 1, inspectionNumber: 1 });

  // pairKey = `${assetId}|${formId}`
  const pairTitle = new Map<string, string>();
  const assetForms = new Map<string, Set<string>>();
  const buckets = new Map<string, Bucket>();
  const assetIds = new Set<string>();
  const formIds = new Set<string>();

  for await (const doc of cursor) {
    const assetId = doc.assetId ? (doc.assetId as ObjectId).toString() : null;
    const formId = doc.formId ? (doc.formId as ObjectId).toString() : null;
    const submittedAt = doc.submittedAt ? new Date(doc.submittedAt as Date) : null;
    if (!assetId || !formId || !submittedAt) continue;

    const pairKey = `${assetId}|${formId}`;
    if (!pairTitle.has(pairKey)) {
      pairTitle.set(pairKey, (doc.formTitle as string) || 'Untitled form');
    }
    if (!assetForms.has(assetId)) assetForms.set(assetId, new Set());
    assetForms.get(assetId)!.add(formId);
    assetIds.add(assetId);
    formIds.add(formId);

    // Only submissions that fall on a visible day colour a cell.
    const day = localDayKey(submittedAt, tz);
    if (!daySet.has(day)) continue;

    const cellKey = `${pairKey}|${day}`;
    const defectCount = Array.isArray(doc.defects) ? (doc.defects as unknown[]).length : 0;
    const isFail = (doc.result as string) === 'fail';
    const at = submittedAt.getTime();
    const existing = buckets.get(cellKey);
    if (existing) {
      existing.count += 1;
      existing.defectCount += defectCount;
      existing.hasFail = existing.hasFail || isFail;
      if (at >= existing.at) {
        existing.at = at;
        existing.submissionId = (doc._id as ObjectId).toString();
        existing.inspectionNumber = (doc.inspectionNumber as string) ?? null;
      }
    } else {
      buckets.set(cellKey, {
        count: 1,
        defectCount,
        hasFail: isFail,
        submissionId: (doc._id as ObjectId).toString(),
        inspectionNumber: (doc.inspectionNumber as string) ?? null,
        at,
      });
    }
  }

  if (assetIds.size === 0) return empty;

  // ── Load the active assets, apply team filter, sort by name, cap ───────────
  const assetsCol = await getAssetsCollection();
  const assetOids = [...assetIds]
    .filter((id) => ObjectId.isValid(id))
    .map((id) => ObjectId.createFromHexString(id));
  const assetFilter: Record<string, unknown> = {
    tenantId: tenantOid,
    _id: { $in: assetOids },
    isArchived: { $ne: true },
  };
  if (teamOids.length) assetFilter.teamIds = { $in: teamOids };

  const assetDocs = await assetsCol
    .find(assetFilter)
    .project({ name: 1, assetNumber: 1 })
    .sort({ name: 1 })
    .toArray();

  const totalActiveAssets = assetDocs.length;
  const capped = assetDocs.slice(0, ASSET_CAP);

  // ── Assemble rows: asset → its active forms → submission-backed cells ──────
  const shownForms = new Set<string>();
  const assets: ExceptionAssetRow[] = capped
    .map((a): ExceptionAssetRow | null => {
      const assetId = (a._id as ObjectId).toString();
      const formSet = assetForms.get(assetId);
      if (!formSet || formSet.size === 0) return null;

      const forms = [...formSet]
        .map((formId) => {
          const pairKey = `${assetId}|${formId}`;
          const cells: Record<string, ExceptionCell> = {};
          for (const day of days) {
            const b = buckets.get(`${pairKey}|${day}`);
            if (!b) continue;
            cells[day] = {
              status: b.hasFail ? 'exception' : 'inspected',
              count: b.count,
              defectCount: b.defectCount,
              submissionId: b.submissionId,
              inspectionNumber: b.inspectionNumber,
            };
          }
          shownForms.add(formId);
          return { formId, formTitle: pairTitle.get(pairKey) || 'Untitled form', cells };
        })
        .sort((x, y) => x.formTitle.localeCompare(y.formTitle));

      return {
        assetId,
        assetName: (a.name as string) || (a.assetNumber as string) || 'Unnamed asset',
        assetNumber: (a.assetNumber as string) ?? null,
        forms,
      };
    })
    .filter((a): a is ExceptionAssetRow => a !== null && a.forms.length > 0);

  return {
    from: options.from,
    to: options.to,
    days,
    today,
    assets,
    meta: {
      assetCount: totalActiveAssets,
      formCount: shownForms.size,
      truncated: totalActiveAssets > capped.length,
      assetCap: ASSET_CAP,
    },
  };
}
