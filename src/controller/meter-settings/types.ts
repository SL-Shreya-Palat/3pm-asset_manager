/** Meter-settings domain types (per-tenant singleton). */
import type { ObjectId } from 'mongodb';

export interface MeterSettingsDocument {
  _id: ObjectId;
  tenantId: ObjectId;
  /**
   * When true (default), a meter reading captured on work-order completion /
   * "Log Service" advances the asset's current meter (and its service baseline).
   * When false, that reading is recorded on the service history only, for
   * reference — the asset's current meter is left untouched.
   */
  serviceUpdatesCurrentMeter: boolean;
  updatedBy?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeterSettingsResponse {
  serviceUpdatesCurrentMeter: boolean;
  updatedAt: string | null;
}

export interface MeterSettingsInput {
  serviceUpdatesCurrentMeter: boolean;
}
