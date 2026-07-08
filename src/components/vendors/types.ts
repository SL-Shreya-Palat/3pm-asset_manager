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

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
