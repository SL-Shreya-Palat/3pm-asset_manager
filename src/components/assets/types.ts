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
  teamIds?: string[];
  teamNames?: string[];
  vin?: string;
  color?: string;
  tireSize?: string;
  notes?: string;
  assetSubtype?: string;
  estimatedCost?: number;
  currencyCode?: string;
  subscriptionType?: string;
  fuelType?: string;
  lastServiceDate?: string;
  lastServiceMileage?: number;
  lastServiceEngineHours?: number;
  formIds?: string[];
  driverAccessIds?: string[];
  createdAt: string;
  /** Worst-case compliance status across the asset's documents. */
  complianceStatus?: 'expired' | 'expiring_soon' | 'valid' | 'none';
}

export interface AssetTypeOption {
  id: string;
  name: string;
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

export interface AssetTypeItem {
  id: string;
  name: string;
  description: string;
}

export interface FormSchemaField {
  id: string;
  type: string;
  label: string;
  fieldKey: string;
  required: boolean;
  width: number;
}

export interface FormSchemaPage {
  id: string;
  title: string;
  pageNumber: number;
  items: FormSchemaField[];
}

export interface FormItem {
  id: string;
  /** Builder form id — used to open the central Defect Settings for this form. */
  formId: string;
  title: string;
  schema: {
    pages: FormSchemaPage[];
  } | null;
}
