/**
 * Document / compliance constants — single source of truth, client-safe.
 *
 * Kept free of any server-only import (no `mongodb`) so both the controller
 * (`controller/documents`) and the `'use client'` compliance tab can import
 * the same enums + labels. Same `as const` arrays feed validators, TS types,
 * and UI labels — mirrors `constants/assets.ts`.
 */

/** What a document attaches to. Phase 1 uses `asset`; the rest are schema-ready. */
export const DOCUMENT_SCOPES = ['asset', 'driver', 'team', 'tenant'] as const;
export type DocumentScope = (typeof DOCUMENT_SCOPES)[number];

/** Compliance document types for an ASSET (NZ fleet: rego / WOF / COF / RUC). */
export const ASSET_DOCUMENT_TYPES = [
  'registration',
  'wof',
  'cof',
  'road_user_charges',
  'insurance',
  'permit',
  'warranty',
  'purchase_lease',
  'other',
] as const;
export type AssetDocumentType = (typeof ASSET_DOCUMENT_TYPES)[number];

/** Compliance document types for a DRIVER (schema-ready for a future driver tab). */
export const DRIVER_DOCUMENT_TYPES = [
  'drivers_licence',
  'medical_certificate',
  'endorsement',
  'training_certificate',
  'id_card',
  'other',
] as const;
export type DriverDocumentType = (typeof DRIVER_DOCUMENT_TYPES)[number];

/** Human labels for every document type (used by the type dropdown + lists). */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  // asset
  registration: 'Registration (Rego)',
  wof: 'Warrant of Fitness (WOF)',
  cof: 'Certificate of Fitness (COF)',
  road_user_charges: 'Road User Charges (RUC)',
  insurance: 'Insurance',
  permit: 'Operating Permit',
  warranty: 'Warranty',
  purchase_lease: 'Purchase / Lease Agreement',
  // driver
  drivers_licence: "Driver's Licence",
  medical_certificate: 'Medical Certificate',
  endorsement: 'Endorsement',
  training_certificate: 'Training Certificate',
  id_card: 'ID Card',
  // shared
  other: 'Other',
};

/** Document types allowed for a given scope, in display order. */
export function documentTypesForScope(scope: DocumentScope): readonly string[] {
  return scope === 'driver' ? DRIVER_DOCUMENT_TYPES : ASSET_DOCUMENT_TYPES;
}

/** Derived compliance status (computed from expiry date, never stored). */
export const DOCUMENT_STATUSES = ['valid', 'expiring_soon', 'expired', 'no_expiry'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Status display config for badges — mirrors `ASSET_STATUS_CONFIG`. */
export const DOCUMENT_STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'outline' }
> = {
  valid: { label: 'Valid', variant: 'success' },
  expiring_soon: { label: 'Expiring soon', variant: 'warning' },
  expired: { label: 'Expired', variant: 'destructive' },
  no_expiry: { label: 'No expiry', variant: 'secondary' },
};

/** Default reminder lead time (days before expiry) — also the "expiring soon" window. */
export const DEFAULT_REMINDER_DAYS = 30;
