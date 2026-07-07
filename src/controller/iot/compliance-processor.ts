/**
 * Sync IoT device expiry data into the asset "Compliance" feature (the
 * `documents` collection). We only write the date-based fields the hub gives:
 * Registration (regoExpiry), WOF/COF (wofOrCof + wofOrCofExpiry). RUC is
 * distance-based (RucDueInKm), which the documents model can't represent as an
 * expiry date, so it's intentionally skipped.
 *
 * Policy (per product decision): IoT owns its OWN docs. Every op is scoped to
 * `source: 'iot'` and upserted per (asset + docType), so we never touch a
 * user's manually-entered compliance document and never create duplicates.
 *
 * Status is derived (not stored), so we only write expiryDate + reminderDays —
 * the Compliance tab and fleet compliance badge update automatically.
 */
import { ObjectId, type Collection } from 'mongodb';
import type { AssetLink } from './asset-processor';

const DEFAULT_REMINDER_DAYS = 30;

/** Parse an IoT date string to UTC-midnight (date-only convention), or null. */
function parseExpiryUtcMidnight(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

interface DocSpec {
  docType: 'registration' | 'wof' | 'cof';
  expiryDate: Date;
}

/** Which compliance docs a device yields (only those with a real expiry date). */
function docSpecsForDevice(device: {
  regoExpiry?: string;
  wofOrCof?: string;
  wofOrCofExpiry?: string;
}): DocSpec[] {
  const specs: DocSpec[] = [];

  const rego = parseExpiryUtcMidnight(device.regoExpiry);
  if (rego) specs.push({ docType: 'registration', expiryDate: rego });

  const wofExpiry = parseExpiryUtcMidnight(device.wofOrCofExpiry);
  if (wofExpiry) {
    const raw = device.wofOrCof || '';
    // WOF vs COF discriminator; skip if we genuinely can't tell.
    const docType = /cof/i.test(raw) ? 'cof' : /wof/i.test(raw) ? 'wof' : null;
    if (docType) specs.push({ docType, expiryDate: wofExpiry });
  }

  return specs;
}

type BulkOp = {
  updateOne: {
    filter: Record<string, unknown>;
    update: { $set: Record<string, unknown>; $setOnInsert: Record<string, unknown> };
    upsert: true;
  };
};

/**
 * Upsert IoT-sourced compliance documents for a set of asset links.
 * Matches on { tenantId, scope:'asset', assetId, docType, source:'iot' } so
 * repeat syncs update in place instead of duplicating.
 */
export async function processComplianceDocuments(
  links: AssetLink[],
  documentsCollection: Collection,
  tenantId: ObjectId,
  userId: ObjectId,
  now: Date,
): Promise<{ created: number; updated: number; errors: string[] }> {
  const result = { created: 0, updated: 0, errors: [] as string[] };
  if (links.length === 0) return result;

  const ops: BulkOp[] = [];
  for (const { assetId, device } of links) {
    for (const spec of docSpecsForDevice(device)) {
      ops.push({
        updateOne: {
          filter: {
            tenantId,
            scope: 'asset',
            assetId,
            docType: spec.docType,
            source: 'iot',
            isArchived: { $ne: true },
          },
          update: {
            $set: {
              expiryDate: spec.expiryDate,
              reminderDays: DEFAULT_REMINDER_DAYS,
              source: 'iot',
              updatedBy: userId,
              updatedAt: now,
            },
            $setOnInsert: {
              _id: new ObjectId(),
              tenantId,
              scope: 'asset',
              assetId,
              docType: spec.docType,
              notes: 'Synced from IoT Hub',
              lastRemindedAt: null,
              createdBy: userId,
              createdAt: now,
              isArchived: false,
              archivedAt: null,
              archivedBy: null,
            },
          },
          upsert: true,
        },
      });
    }
  }
  if (ops.length === 0) return result;

  const MAX_BULK = 1000;
  for (let i = 0; i < ops.length; i += MAX_BULK) {
    const chunk = ops.slice(i, i + MAX_BULK);
    try {
      const res = await documentsCollection.bulkWrite(chunk, { ordered: false });
      result.created += res.upsertedCount;
      result.updated += res.modifiedCount;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown compliance bulk write error';
      result.errors.push(`Compliance bulk write error (chunk ${Math.floor(i / MAX_BULK) + 1}): ${msg}`);
      console.error('[IoT] Compliance bulk write error:', error);
    }
  }
  return result;
}
