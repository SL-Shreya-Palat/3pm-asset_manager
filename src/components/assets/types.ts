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
  title: string;
  schema: {
    pages: FormSchemaPage[];
  } | null;
}
