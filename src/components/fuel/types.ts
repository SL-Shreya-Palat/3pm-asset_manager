export interface FuelTransactionRow {
  id: string;
  assetId: string;
  assetName?: string;
  driverId?: string;
  driverName?: string;
  date: string;
  startMileage?: number;
  endMileage?: number;
  distance?: number;
  volume: number;
  unitCost?: number;
  totalCost: number;
  fuelType: string;
  economy?: number;
  costPerMile?: number;
  station?: string;
  notes?: string;
  source: string;
  importBatchId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface FuelAnalyticsSummary {
  totalTransactions: number;
  totalVolume: number;
  totalCost: number;
  totalDistance: number;
  avgEconomy: number | null;
  avgCostPerMile: number | null;
}
