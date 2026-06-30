export interface TeamRow {
  id: string;
  name: string;
  assetCount: number;
  driverCount: number;
  createdAt: string;
}

export interface AssetRow {
  id: string;
  name: string;
  assetNumber?: string;
  status: string;
  make?: string;
  model?: string;
  year?: number;
  licensePlate?: string;
  assetTypeName?: string;
  currentOdometer?: number;
  currentEngineHours?: number;
  teamIds: string[];
  teamNames: string[];
  vin?: string;
  color?: string;
  tireSize?: string;
  notes?: string;
  assetSubtype?: string;
  estimatedCost?: number;
  currencyCode?: string;
  subscriptionType?: string;
  lastServiceDate?: string;
  lastServiceMileage?: number;
  lastServiceEngineHours?: number;
}

export interface DriverRow {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  mobileNumber?: string;
  employeeNumber?: string;
  licenseNumber?: string;
  teamId?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
