/**
 * Command integration — public surface (server-side only).
 *
 * Usage:  import { command } from '@/lib/command';
 *         const res = await command.getOptions('assets', authTenantId);
 */

export { isCommandConfigured, commandRequest, commandWrite, getCircuitState } from './client';
export { getOptions, getPage, getCommandStaff, ping } from './fetchers';
export type { CommandPage, CommandStaff } from './fetchers';
export { getCommandStockLevels, getCommandStockItem, pushStockOut } from './stock';
export type { CommandStockLevel, CommandStockItem } from './stock';
export {
  pushAssetMeters,
  pushAssetCompliance,
  pushAssetAvailability,
  pushAssetActivity,
} from './writeback';
export type {
  AssetMetersPush,
  AssetCompliancePush,
  AssetAvailabilityPush,
  AssetActivityPush,
} from './writeback';
export { tenantSubscribesToCommand, isEntitlementCheckConfigured } from './threepm-data';
export type {
  CommandEntity,
  CommandOption,
  CommandResult,
  CommandFailureReason,
} from './types';

import { isCommandConfigured, getCircuitState } from './client';
import { getOptions, getPage, getCommandStaff, ping } from './fetchers';
import { getCommandStockLevels, getCommandStockItem, pushStockOut } from './stock';
import {
  pushAssetMeters,
  pushAssetCompliance,
  pushAssetAvailability,
  pushAssetActivity,
} from './writeback';

/** Convenience facade. */
export const command = {
  isConfigured: isCommandConfigured,
  circuitState: getCircuitState,
  getOptions,
  getPage,
  getStaff: getCommandStaff,
  ping,
  getStockLevels: getCommandStockLevels,
  getStockItem: getCommandStockItem,
  pushStockOut,
  pushAssetMeters,
  pushAssetCompliance,
  pushAssetAvailability,
  pushAssetActivity,
};
