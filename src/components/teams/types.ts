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

export interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber?: string;
  roleId?: string;
  roleName?: string;
  status: 'pending' | 'active';
  isActive: boolean;
  portalUser: boolean;
  teamIds: string[];
  teamNames: string[];
  teamRole?: 'managing' | 'following';
  createdAt: string;
  updatedAt: string;
}

export interface DefectRow {
  id: string;
  defectNumber: string;
  name: string;
  date: string;
  comment: string;
  assetId: string;
  assetName: string;
  driverId?: string | null;
  driverName?: string | null;
  priority: 'high' | 'medium' | 'low';
  severity: 'high' | 'medium' | 'low';
  status: 'new' | 'in_progress' | 'corrected' | 'no_correction_needed';
  teamIds: string[];
  teamNames: string[];
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionRow {
  id: string;
  inspectionNumber: string | null;
  formTitle: string;
  assetName: string | null;
  operatorName: string | null;
  result: 'pass' | 'fail';
  defectCount: number;
  submittedAt: string | null;
  teamIds: string[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
