/**
 * Asset-related constants — single source of truth.
 * Same `as const` arrays feed validators, TS types, and UI labels.
 */

export const ASSET_STATUSES = ['in_service', 'out_of_service'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const FUEL_TYPES = ['diesel', 'petrol', 'electric', 'lpg', 'cng', 'other'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const METER_TYPES = ['odometer', 'engine_hours'] as const;
export type MeterType = (typeof METER_TYPES)[number];

export const SUBSCRIPTION_TYPES = ['owned', 'leased', 'rented', 'financed'] as const;
export type SubscriptionType = (typeof SUBSCRIPTION_TYPES)[number];

/** Currency list for estimated cost field. */
export const CURRENCIES = [
  { code: 'USD', label: 'USD ($)', symbol: '$' },
  { code: 'EUR', label: 'EUR (\u20ac)', symbol: '\u20ac' },
  { code: 'GBP', label: 'GBP (\u00a3)', symbol: '\u00a3' },
  { code: 'NZD', label: 'NZD ($)', symbol: '$' },
  { code: 'AUD', label: 'AUD ($)', symbol: '$' },
  { code: 'CAD', label: 'CAD ($)', symbol: '$' },
  { code: 'INR', label: 'INR (\u20b9)', symbol: '\u20b9' },
] as const;

/** Status display config for badges. */
export const ASSET_STATUS_CONFIG: Record<AssetStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'outline' }> = {
  in_service: { label: 'Active', variant: 'success' },
  out_of_service: { label: 'Under Maintenance', variant: 'warning' },
};
