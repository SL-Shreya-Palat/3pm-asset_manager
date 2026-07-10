export interface VendorRow {
  id: string;
  name: string;
  contactName: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  vendorTypes: string[];
  publicEditAccess: boolean;
  laborRatePerHour?: number;
  createdAt: string;
  /** 'command' when mastered in Command (read-only, auto-synced), else 'local'. */
  source?: string;
}

/**
 * Display labels for vendor-type values. The stored value stays 'parts'
 * (no data migration); only the label shown to users changes.
 */
export const VENDOR_TYPE_LABELS: Record<string, string> = {
  parts: 'Stock',
  services: 'Services',
};

/** Map a stored vendor-type value to its display label. */
export function vendorTypeLabel(value: string): string {
  return VENDOR_TYPE_LABELS[value] ?? value;
}

/** Ensure a vendor website string is an absolute URL usable as an href. */
export function vendorWebsiteHref(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
