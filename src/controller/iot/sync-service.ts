/**
 * Orchestrates a full IoT Hub → assets sync for one tenant:
 *   token → ensure client + provider mappings → fetch devices → batched upsert.
 *
 * Batched (100/batch, up to 5 batches in parallel) with a 5-minute wall-clock
 * guard so a large fleet can't hang a request.
 */
import { ObjectId } from 'mongodb';
import { getAssetsCollection, getDocumentsCollection } from '@/lib/mongodb';
import { getIoTSettings, markSynced } from './settings-service';
import { generateAccessToken, fetchAssetsFromIoTHub } from './api';
import { ensureIoTHubClientAndMappings } from './hub-client';
import { processDevicesBatch, type AssetLink } from './asset-processor';
import { processComplianceDocuments } from './compliance-processor';

export interface SyncResult {
  success: boolean;
  totalDevices: number;
  created: number;
  updated: number;
  /** IoT-sourced compliance documents (rego/WOF/COF) created + updated. */
  complianceCreated: number;
  complianceUpdated: number;
  errors: string[];
}

const BATCH_SIZE = 100;
const MAX_PARALLEL_BATCHES = 5;
const MAX_ERRORS = 100;
const TIMEOUT_MS = 5 * 60 * 1000;

export async function syncAssetsFromIoTHub(
  tenantId: ObjectId,
  userId: string,
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    totalDevices: 0,
    created: 0,
    updated: 0,
    complianceCreated: 0,
    complianceUpdated: 0,
    errors: [],
  };
  const startTime = Date.now();

  try {
    const settings = await getIoTSettings(tenantId);
    if (!settings.providerNames || settings.providerNames.length === 0) {
      throw new Error('No IoT providers configured. Configure providers in IoT Settings.');
    }

    const accessToken = await generateAccessToken();
    const clientId = await ensureIoTHubClientAndMappings(tenantId, settings, accessToken);

    const devices = await fetchAssetsFromIoTHub(clientId, accessToken);
    result.totalDevices = devices.length;
    console.log(`[IoT] Fetched ${devices.length} devices for tenant ${tenantId}`);

    if (devices.length === 0) {
      result.success = true;
      await markSynced(tenantId);
      return result;
    }

    const assetsCollection = await getAssetsCollection();
    const documentsCollection = await getDocumentsCollection();
    const userOid = ObjectId.createFromHexString(userId);
    const now = new Date();

    const batches: (typeof devices)[] = [];
    for (let i = 0; i < devices.length; i += BATCH_SIZE) {
      batches.push(devices.slice(i, i + BATCH_SIZE));
    }

    for (let i = 0; i < batches.length; i += MAX_PARALLEL_BATCHES) {
      if (Date.now() - startTime > TIMEOUT_MS) throw new Error('Sync operation timed out');

      const group = batches.slice(i, i + MAX_PARALLEL_BATCHES);
      const settled = await Promise.allSettled(
        group.map((batch) => processDevicesBatch(batch, assetsCollection, tenantId, userOid, now)),
      );
      const links: AssetLink[] = [];
      for (const s of settled) {
        if (s.status === 'fulfilled') {
          result.created += s.value.created;
          result.updated += s.value.updated;
          result.errors.push(...s.value.errors);
          links.push(...s.value.links);
        } else {
          result.errors.push(`Batch error: ${s.reason?.message || 'Unknown error'}`);
        }
      }

      // Sync IoT-sourced compliance documents (rego/WOF/COF) for this group.
      if (links.length > 0) {
        const compliance = await processComplianceDocuments(
          links,
          documentsCollection,
          tenantId,
          userOid,
          now,
        );
        result.complianceCreated += compliance.created;
        result.complianceUpdated += compliance.updated;
        result.errors.push(...compliance.errors);
      }
      if (result.errors.length >= MAX_ERRORS) {
        console.warn(`[IoT] Stopping sync — too many errors (${result.errors.length})`);
        break;
      }
    }

    result.success = result.errors.length < MAX_ERRORS;
    if (result.success) await markSynced(tenantId);

    console.log(
      `[IoT] Sync done for ${tenantId}: assets ${result.created} created / ${result.updated} updated, compliance ${result.complianceCreated} created / ${result.complianceUpdated} updated, ${result.errors.length} errors in ${Date.now() - startTime}ms`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to sync assets from IoT Hub';
    result.errors.push(msg);
    console.error(`[IoT] Sync error for tenant ${tenantId}:`, error);
  }

  return result;
}
