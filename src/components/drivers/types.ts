export interface DriverRow {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  photoUrl?: string;
  notes?: string;
  teamId?: string;
  countryCode?: string;
  mobileNumber?: string;
  homePhone?: string;
  workPhone?: string;
  dateOfBirth?: string | null;
  employeeNumber?: string;
  jobPosition?: string;
  rateCurrency?: string;
  ratePerUnit?: number;
  otherNotes?: string;
  driverLicense?: string;
  licenseClass?: string;
  licenseNumber?: string;
  healthCertificate?: string;
  tenantMemberId?: string;
  createdAt: string;
}

export interface TeamOption {
  id: string;
  name: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
