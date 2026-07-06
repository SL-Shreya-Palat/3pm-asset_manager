/**
 * Command write-back outbox.
 *
 * Write-backs (meters / compliance / availability / activity) are pushed
 * immediately; when Command is UNREACHABLE the push is queued here and replayed
 * by the cron scan, so a Command outage never loses signals. Definitive
 * rejections (4xx) are NOT retried — they won't fix themselves; they're kept as
 * `dead` rows for diagnostics.
 */

import { ObjectId } from 'mongodb';
import { getCommandOutboxCollection } from '@/lib/mongodb';
import {
  pushAssetMeters,
  pushAssetCompliance,
  pushAssetAvailability,
  pushAssetActivity,
} from '@/lib/command/writeback';
import type { CommandResult } from '@/lib/command/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type WritebackKind = 'meters' | 'compliance' | 'availability' | 'activity';

const MAX_ATTEMPTS = 10;

function pushByKind(
  kind: WritebackKind,
  commandAssetId: string,
  authTenantId: string,
  payload: any,
  actorEmail?: string,
): Promise<CommandResult<unknown>> {
  switch (kind) {
    case 'meters':
      return pushAssetMeters(commandAssetId, authTenantId, payload, actorEmail);
    case 'compliance':
      return pushAssetCompliance(commandAssetId, authTenantId, payload, actorEmail);
    case 'availability':
      return pushAssetAvailability(commandAssetId, authTenantId, payload, actorEmail);
    case 'activity':
      return pushAssetActivity(commandAssetId, authTenantId, payload, actorEmail);
  }
}

/**
 * Push a write-back to Command now; queue it for replay when Command is
 * unreachable. Fire-and-forget safe: never throws.
 */
export async function pushOrQueueWriteback(input: {
  tenantId: string | ObjectId;
  authTenantId: string;
  kind: WritebackKind;
  commandAssetId: string;
  payload: Record<string, unknown>;
  actorEmail?: string;
}): Promise<void> {
  try {
    const res = await pushByKind(
      input.kind,
      input.commandAssetId,
      input.authTenantId,
      input.payload,
      input.actorEmail,
    );
    if (res.ok) return;
    if (res.reason === 'not_configured') return; // standalone — nothing to do

    const outbox = await getCommandOutboxCollection();
    const now = new Date();
    const tenantId =
      input.tenantId instanceof ObjectId
        ? input.tenantId
        : ObjectId.createFromHexString(String(input.tenantId));

    // Unreachable → replayable. Definitive rejection → dead (diagnostics only).
    const replayable = res.reason === 'unreachable';
    await outbox.insertOne({
      tenantId,
      authTenantId: input.authTenantId,
      kind: input.kind,
      commandAssetId: input.commandAssetId,
      payload: input.payload,
      actorEmail: input.actorEmail ?? null,
      status: replayable ? 'pending' : 'dead',
      attempts: 1,
      lastError: res.message ?? res.reason,
      createdAt: now,
      updatedAt: now,
    });
    if (!replayable) {
      console.warn(
        `[command-outbox] ${input.kind} write-back rejected by Command (${res.reason}${res.status ? ` ${res.status}` : ''}) for asset ${input.commandAssetId}`,
      );
    }
  } catch (e) {
    console.error('[command-outbox] pushOrQueueWriteback failed:', e);
  }
}

/**
 * Replay pending outbox rows (oldest first). Called from the cron scan.
 * Returns counts for observability.
 */
export async function processCommandOutbox(
  limit = 50,
): Promise<{ replayed: number; failed: number; dead: number }> {
  const outbox = await getCommandOutboxCollection();
  const rows = await outbox
    .find({ status: 'pending' })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  let replayed = 0;
  let failed = 0;
  let dead = 0;

  for (const row of rows) {
    const res = await pushByKind(
      row.kind as WritebackKind,
      String(row.commandAssetId),
      String(row.authTenantId),
      row.payload,
      (row.actorEmail as string | null) ?? undefined,
    );
    if (res.ok) {
      await outbox.deleteOne({ _id: row._id });
      replayed++;
      continue;
    }
    const attempts = Number(row.attempts ?? 0) + 1;
    const isDead =
      res.reason !== 'unreachable' || attempts >= MAX_ATTEMPTS;
    await outbox.updateOne(
      { _id: row._id },
      {
        $set: {
          attempts,
          lastError: res.message ?? res.reason,
          status: isDead ? 'dead' : 'pending',
          updatedAt: new Date(),
        },
      },
    );
    if (isDead) dead++;
    else failed++;
  }

  return { replayed, failed, dead };
}
