/**
 * Command write-backs (server-side only).
 *
 * When connected, Asset Manager owns pre-start / servicing / workshop
 * management, so it must push back the signals Command's other modules still
 * depend on (see construction-portal consumers):
 *  - meter readings  → Command's next-service calc + asset list
 *  - compliance dates → rego / WOF / COF expiry on the Command asset
 *  - availability     → outOfService flag (timesheet/planning pickers)
 *  - activity rows    → the Command asset's Activity tab stays alive
 *
 * All calls use strict lockstep via `commandWrite` (no retry — callers queue
 * failures in the command outbox for the cron to replay).
 */

import { commandWrite } from './client';
import type { CommandResult } from './types';

export interface AssetMetersPush {
  odometer?: number;
  hubometer?: number;
  engineHours?: number;
  /** ISO timestamp of when the reading was taken (defaults to now on Command). */
  recordedAt?: string;
  /** Where the reading came from (e.g. 'prestart', 'work_order', 'manual'). */
  source?: string;
}

export interface AssetCompliancePush {
  /** ISO date strings — only provided fields are updated. */
  regoExpiry?: string;
  wofDate?: string;
  cofDate?: string;
}

export interface AssetAvailabilityPush {
  outOfService: boolean;
  reason?: string;
}

export interface AssetActivityPush {
  /** Activity type key (e.g. 'prestart_submitted', 'service_completed'). */
  type: string;
  title?: string;
  description?: string;
  meta?: Record<string, unknown>;
}

/** Push meter readings onto the Command asset (+ meter_reading activity). */
export function pushAssetMeters(
  commandAssetId: string,
  authTenantId: string,
  payload: AssetMetersPush,
  actorEmail?: string,
): Promise<CommandResult<unknown>> {
  return commandWrite(
    `/api/assets/${encodeURIComponent(commandAssetId)}/meters`,
    authTenantId,
    'POST',
    payload,
    { actorEmail },
  );
}

/** Push compliance expiry dates onto the Command asset. */
export function pushAssetCompliance(
  commandAssetId: string,
  authTenantId: string,
  payload: AssetCompliancePush,
  actorEmail?: string,
): Promise<CommandResult<unknown>> {
  return commandWrite(
    `/api/assets/${encodeURIComponent(commandAssetId)}/compliance`,
    authTenantId,
    'PATCH',
    payload,
    { actorEmail },
  );
}

/** Flip the Command asset's outOfService flag (defect opened/closed). */
export function pushAssetAvailability(
  commandAssetId: string,
  authTenantId: string,
  payload: AssetAvailabilityPush,
  actorEmail?: string,
): Promise<CommandResult<unknown>> {
  return commandWrite(
    `/api/assets/${encodeURIComponent(commandAssetId)}/availability`,
    authTenantId,
    'PATCH',
    payload,
    { actorEmail },
  );
}

/** Append a row to the Command asset's activity timeline. */
export function pushAssetActivity(
  commandAssetId: string,
  authTenantId: string,
  payload: AssetActivityPush,
  actorEmail?: string,
): Promise<CommandResult<unknown>> {
  return commandWrite(
    `/api/assets/${encodeURIComponent(commandAssetId)}/activity`,
    authTenantId,
    'POST',
    payload,
    { actorEmail },
  );
}
