/** Frontend types for the inventory (parts) module. */

export interface PartVendorRow {
  vendorId: string;
  unitCost: number;
}

export interface StockLocationRow {
  /** null = "Unassigned" bucket (stock not tied to a named location). */
  locationId: string | null;
  quantity: number;
}

export interface PartRow {
  id: string;
  name: string;
  partNumber: string;
  upc?: string;
  description?: string;
  photoUrl?: string;

  measurementUnitId?: string;
  categoryId?: string;
  reorderPoint?: number;
  maximumQuantity?: number;
  vendors: PartVendorRow[];
  stockLocations: StockLocationRow[];
  createdBy: string | null;
  createdAt: string;
  /** 'command' when mastered in Command (read-only, auto-synced), else 'local'. */
  source?: string;
}

/** Lookup option for settings dropdowns. */
export interface LookupOption {
  id: string;
  name: string;
  symbol?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
