/**
 * GET /api/config — Widget Builder API discovery endpoint.
 *
 * Widget Builder calls this (authenticated via X-App-Secret) to learn which
 * asset-manager APIs widgets can chart. Every list endpoint returns the
 * shared `{ data: { items, pagination } }` envelope, so `listArrayPath` is
 * always `data.items`.
 *
 * Mirrors construction-portal/app/api/config/route.ts (static catalog
 * instead of its api-discovery module — add endpoints here as needed).
 */
import { NextRequest, NextResponse } from 'next/server';

const PAGINATION_PARAMS = [
  { name: 'page', type: 'number', required: false, description: 'Page number (default: 1)' },
  { name: 'limit', type: 'number', required: false, description: 'Records per page (default: 25, max: 100)' },
  { name: 'search', type: 'string', required: false, description: 'Search / filter query' },
];

const ENDPOINTS = [
  {
    path: '/api/assets',
    method: 'GET',
    description: 'Paginated list of fleet assets (vehicles, trailers, equipment)',
    module: 'assets',
    queryParameters: [
      ...PAGINATION_PARAMS,
      { name: 'status', type: 'string', required: false, description: "Filter by status: 'in_service' or 'out_of_service'" },
      { name: 'teamId', type: 'string', required: false, description: 'Filter by team ObjectId' },
    ],
    listArrayPath: 'data.items',
    fieldSchema: [
      { name: 'id', path: 'id', type: 'objectId', description: 'Unique asset identifier', isIdentifier: true },
      { name: 'name', path: 'name', type: 'string', description: 'Asset name', isIdentifier: true },
      { name: 'assetNumber', path: 'assetNumber', type: 'string', description: 'Fleet asset number', isIdentifier: true },
      { name: 'status', path: 'status', type: 'string', description: 'Service status', groupable: true, enumValues: ['in_service', 'out_of_service'] },
      { name: 'make', path: 'make', type: 'string', description: 'Manufacturer', groupable: true },
      { name: 'model', path: 'model', type: 'string', description: 'Model', groupable: true },
      { name: 'year', path: 'year', type: 'number', description: 'Manufacture year', groupable: true },
      { name: 'type', path: 'type', type: 'string', description: 'Asset type/category', groupable: true },
      { name: 'assetTypeName', path: 'assetTypeName', type: 'string', description: 'Asset type name (populated)', groupable: true },
      { name: 'fuelType', path: 'fuelType', type: 'string', description: 'Fuel type', groupable: true },
      { name: 'currentOdometer', path: 'currentOdometer', type: 'number', description: 'Latest odometer reading', numeric: true },
      { name: 'currentEngineHours', path: 'currentEngineHours', type: 'number', description: 'Latest engine hours', numeric: true },
      { name: 'estimatedCost', path: 'estimatedCost', type: 'number', description: 'Estimated asset value', numeric: true },
      { name: 'lastServiceDate', path: 'lastServiceDate', type: 'date', description: 'Last service date', dateLike: true },
      { name: 'createdAt', path: 'createdAt', type: 'date', description: 'Record creation date', dateLike: true },
    ],
  },
  {
    path: '/api/work-orders',
    method: 'GET',
    description: 'Paginated list of maintenance work orders',
    module: 'maintenance',
    queryParameters: PAGINATION_PARAMS,
    listArrayPath: 'data.items',
    fieldSchema: [
      { name: 'id', path: 'id', type: 'objectId', description: 'Unique work order identifier', isIdentifier: true },
      { name: 'workOrderNumber', path: 'workOrderNumber', type: 'number', description: 'Work order number', isIdentifier: true },
      { name: 'assetId', path: 'assetId', type: 'objectId', description: 'Asset this work order belongs to', lookupRef: 'assets' },
      { name: 'assetName', path: 'assetName', type: 'string', description: 'Asset name', groupable: true },
      { name: 'statusLabel', path: 'statusLabel', type: 'string', description: 'Workflow status label', groupable: true },
      { name: 'source', path: 'source', type: 'string', description: 'Origin of the work order', groupable: true, enumValues: ['manual', 'defect', 'service_reminder'] },
      { name: 'assigneeType', path: 'assigneeType', type: 'string', description: 'Assignee type (user/vendor)', groupable: true },
      { name: 'assigneeName', path: 'assigneeName', type: 'string', description: 'Assignee name', groupable: true },
      { name: 'partsCost', path: 'partsCost', type: 'number', description: 'Total parts cost', numeric: true },
      { name: 'isCompleted', path: 'isCompleted', type: 'boolean', description: 'Whether the work order is completed', groupable: true },
      { name: 'dueDate', path: 'dueDate', type: 'date', description: 'Due date', dateLike: true },
      { name: 'completedAt', path: 'completedAt', type: 'date', description: 'Completion date', dateLike: true },
      { name: 'createdAt', path: 'createdAt', type: 'date', description: 'Record creation date', dateLike: true },
    ],
  },
  {
    path: '/api/defects',
    method: 'GET',
    description: 'Paginated list of defects raised from failed inspections (see /api/faults for driver-reported faults)',
    module: 'maintenance',
    queryParameters: PAGINATION_PARAMS,
    listArrayPath: 'data.items',
    fieldSchema: [
      { name: 'id', path: 'id', type: 'objectId', description: 'Unique defect identifier', isIdentifier: true },
      { name: 'defectNumber', path: 'defectNumber', type: 'number', description: 'Defect number', isIdentifier: true },
      { name: 'name', path: 'name', type: 'string', description: 'Defect title', isIdentifier: true },
      { name: 'status', path: 'status', type: 'string', description: 'Defect lifecycle status', groupable: true, enumValues: ['new', 'in_progress', 'corrected', 'no_correction_needed'] },
      { name: 'priority', path: 'priority', type: 'string', description: 'Priority', groupable: true },
      { name: 'severity', path: 'severity', type: 'string', description: 'Severity', groupable: true },
      { name: 'assetId', path: 'assetId', type: 'objectId', description: 'Asset the defect was reported on', lookupRef: 'assets' },
      { name: 'assetName', path: 'assetName', type: 'string', description: 'Asset name', groupable: true },
      { name: 'driverName', path: 'driverName', type: 'string', description: 'Reporting driver', groupable: true },
      { name: 'date', path: 'date', type: 'date', description: 'Date reported', dateLike: true },
    ],
  },
  {
    path: '/api/fuel',
    method: 'GET',
    description: 'Paginated list of fuel transactions',
    module: 'fuel',
    queryParameters: PAGINATION_PARAMS,
    listArrayPath: 'data.items',
    fieldSchema: [
      { name: 'id', path: 'id', type: 'objectId', description: 'Unique transaction identifier', isIdentifier: true },
      { name: 'assetId', path: 'assetId', type: 'objectId', description: 'Asset that was fueled', lookupRef: 'assets' },
      { name: 'assetName', path: 'assetName', type: 'string', description: 'Asset name', groupable: true },
      { name: 'driverName', path: 'driverName', type: 'string', description: 'Driver name', groupable: true },
      { name: 'fuelType', path: 'fuelType', type: 'string', description: 'Fuel type', groupable: true },
      { name: 'volume', path: 'volume', type: 'number', description: 'Fuel volume', numeric: true },
      { name: 'unitCost', path: 'unitCost', type: 'number', description: 'Cost per unit', numeric: true },
      { name: 'totalCost', path: 'totalCost', type: 'number', description: 'Total transaction cost', numeric: true },
      { name: 'distance', path: 'distance', type: 'number', description: 'Distance since last fill-up', numeric: true },
      { name: 'economy', path: 'economy', type: 'number', description: 'Fuel economy', numeric: true },
      { name: 'station', path: 'station', type: 'string', description: 'Fuel station', groupable: true },
      { name: 'date', path: 'date', type: 'date', description: 'Transaction date', dateLike: true },
    ],
  },
  {
    path: '/api/faults',
    method: 'GET',
    description: 'Paginated list of faults reported directly by drivers or staff (distinct from inspection-raised defects)',
    module: 'maintenance',
    queryParameters: [
      ...PAGINATION_PARAMS,
      { name: 'status', type: 'string', required: false, description: "Filter by status: 'open', 'in_progress', 'resolved', 'wont_fix'" },
      { name: 'priority', type: 'string', required: false, description: "Filter by priority: 'high', 'medium', 'low'" },
      { name: 'severity', type: 'string', required: false, description: "Filter by severity: 'high', 'medium', 'low'" },
      { name: 'assetId', type: 'string', required: false, description: 'Filter by asset ObjectId' },
      { name: 'teamId', type: 'string', required: false, description: 'Filter by team ObjectId' },
    ],
    listArrayPath: 'data.items',
    fieldSchema: [
      { name: 'id', path: 'id', type: 'objectId', description: 'Unique fault identifier', isIdentifier: true },
      { name: 'faultNumber', path: 'faultNumber', type: 'number', description: 'Fault number', isIdentifier: true },
      { name: 'title', path: 'title', type: 'string', description: 'Fault title', isIdentifier: true },
      { name: 'status', path: 'status', type: 'string', description: 'Fault lifecycle status', groupable: true, enumValues: ['open', 'in_progress', 'resolved', 'wont_fix'] },
      { name: 'priority', path: 'priority', type: 'string', description: 'Priority', groupable: true, enumValues: ['high', 'medium', 'low'] },
      { name: 'severity', path: 'severity', type: 'string', description: 'Severity', groupable: true, enumValues: ['high', 'medium', 'low'] },
      { name: 'category', path: 'category', type: 'string', description: 'Fault category', groupable: true },
      { name: 'assetId', path: 'assetId', type: 'objectId', description: 'Asset the fault was reported on', lookupRef: 'assets' },
      { name: 'assetName', path: 'assetName', type: 'string', description: 'Asset name', groupable: true },
      { name: 'reportedByName', path: 'reportedByName', type: 'string', description: 'Who reported the fault', groupable: true },
      { name: 'reportedAt', path: 'reportedAt', type: 'date', description: 'Date reported', dateLike: true },
      { name: 'createdAt', path: 'createdAt', type: 'date', description: 'Record creation date', dateLike: true },
    ],
  },
  {
    path: '/api/inspection-submissions',
    method: 'GET',
    description: 'Paginated list of completed pre-start inspection submissions',
    module: 'inspections',
    queryParameters: [
      ...PAGINATION_PARAMS,
      { name: 'result', type: 'string', required: false, description: "Filter by result: 'pass' or 'fail'" },
      { name: 'assetId', type: 'string', required: false, description: 'Filter by asset ObjectId' },
      { name: 'teamId', type: 'string', required: false, description: 'Filter by team ObjectId' },
    ],
    listArrayPath: 'data.items',
    fieldSchema: [
      { name: 'id', path: 'id', type: 'objectId', description: 'Unique submission identifier', isIdentifier: true },
      { name: 'inspectionNumber', path: 'inspectionNumber', type: 'string', description: 'Inspection number', isIdentifier: true },
      { name: 'formTitle', path: 'formTitle', type: 'string', description: 'Inspection form title', groupable: true },
      { name: 'assetId', path: 'assetId', type: 'objectId', description: 'Inspected asset', lookupRef: 'assets' },
      { name: 'assetName', path: 'assetName', type: 'string', description: 'Asset name', groupable: true },
      { name: 'operatorName', path: 'operatorName', type: 'string', description: 'Operator/driver who performed the inspection', groupable: true },
      { name: 'result', path: 'result', type: 'string', description: 'Inspection outcome', groupable: true, enumValues: ['pass', 'fail'] },
      { name: 'defectCount', path: 'defectCount', type: 'number', description: 'Defects raised by this inspection', numeric: true },
      { name: 'source', path: 'source', type: 'string', description: 'How the submission arrived', groupable: true },
      { name: 'submittedAt', path: 'submittedAt', type: 'date', description: 'Submission date/time', dateLike: true },
    ],
  },
  {
    path: '/api/parts',
    method: 'GET',
    description: 'Paginated list of inventory parts',
    module: 'inventory',
    queryParameters: [
      ...PAGINATION_PARAMS,
      { name: 'categoryId', type: 'string', required: false, description: 'Filter by part category ObjectId' },
    ],
    listArrayPath: 'data.items',
    fieldSchema: [
      { name: 'id', path: 'id', type: 'objectId', description: 'Unique stock identifier', isIdentifier: true },
      { name: 'name', path: 'name', type: 'string', description: 'Stock name', isIdentifier: true },
      { name: 'partNumber', path: 'partNumber', type: 'string', description: 'Stock number', isIdentifier: true },
      { name: 'categoryId', path: 'categoryId', type: 'objectId', description: 'Stock category' },
      { name: 'reorderPoint', path: 'reorderPoint', type: 'number', description: 'Reorder threshold', numeric: true },
      { name: 'maximumQuantity', path: 'maximumQuantity', type: 'number', description: 'Maximum stock quantity', numeric: true },
      { name: 'isActive', path: 'isActive', type: 'boolean', description: 'Whether the stock item is active', groupable: true },
      { name: 'createdAt', path: 'createdAt', type: 'date', description: 'Record creation date', dateLike: true },
    ],
  },
  {
    path: '/api/purchase-orders',
    method: 'GET',
    description: 'Paginated list of purchase orders for parts',
    module: 'inventory',
    queryParameters: [
      ...PAGINATION_PARAMS,
      { name: 'status', type: 'string', required: false, description: "Filter by status: 'draft', 'pending_approval', 'rejected', 'approved', 'purchased', 'received', 'received_partial', 'closed'" },
    ],
    listArrayPath: 'data.items',
    fieldSchema: [
      { name: 'id', path: 'id', type: 'objectId', description: 'Unique purchase order identifier', isIdentifier: true },
      { name: 'poNumber', path: 'poNumber', type: 'string', description: 'Purchase order number', isIdentifier: true },
      { name: 'status', path: 'status', type: 'string', description: 'PO lifecycle status', groupable: true, enumValues: ['draft', 'pending_approval', 'rejected', 'approved', 'purchased', 'received', 'received_partial', 'closed'] },
      { name: 'vendorId', path: 'vendorId', type: 'objectId', description: 'Vendor the PO is placed with', lookupRef: 'vendors' },
      { name: 'vendorName', path: 'vendorName', type: 'string', description: 'Vendor name', groupable: true },
      { name: 'subTotal', path: 'subTotal', type: 'number', description: 'Subtotal before shipping/tax', numeric: true },
      { name: 'shipping', path: 'shipping', type: 'number', description: 'Shipping cost', numeric: true },
      { name: 'total', path: 'total', type: 'number', description: 'Total PO value', numeric: true },
      { name: 'stockReceivedAt', path: 'stockReceivedAt', type: 'date', description: 'Date stock was received', dateLike: true },
      { name: 'createdAt', path: 'createdAt', type: 'date', description: 'Record creation date', dateLike: true },
    ],
  },
  {
    path: '/api/vendors',
    method: 'GET',
    description: 'Paginated list of vendors (suppliers and service providers)',
    module: 'vendors',
    queryParameters: PAGINATION_PARAMS,
    listArrayPath: 'data.items',
    fieldSchema: [
      { name: 'id', path: 'id', type: 'objectId', description: 'Unique vendor identifier', isIdentifier: true },
      { name: 'name', path: 'name', type: 'string', description: 'Vendor name', isIdentifier: true },
      { name: 'contactName', path: 'contactName', type: 'string', description: 'Primary contact', groupable: true },
      { name: 'email', path: 'email', type: 'string', description: 'Contact email' },
      { name: 'phone', path: 'phone', type: 'string', description: 'Contact phone' },
      { name: 'laborRatePerHour', path: 'laborRatePerHour', type: 'number', description: 'Labour rate per hour', numeric: true },
      { name: 'isActive', path: 'isActive', type: 'boolean', description: 'Whether the vendor is active', groupable: true },
      { name: 'createdAt', path: 'createdAt', type: 'date', description: 'Record creation date', dateLike: true },
    ],
  },
  {
    path: '/api/drivers',
    method: 'GET',
    description: 'Paginated list of drivers (operators)',
    module: 'people',
    queryParameters: [
      ...PAGINATION_PARAMS,
      { name: 'teamId', type: 'string', required: false, description: 'Filter by team ObjectId' },
    ],
    listArrayPath: 'data.items',
    fieldSchema: [
      { name: 'id', path: 'id', type: 'objectId', description: 'Unique driver identifier', isIdentifier: true },
      { name: 'firstName', path: 'firstName', type: 'string', description: 'First name', isIdentifier: true },
      { name: 'lastName', path: 'lastName', type: 'string', description: 'Last name', isIdentifier: true },
      { name: 'email', path: 'email', type: 'string', description: 'Email address' },
      { name: 'jobPosition', path: 'jobPosition', type: 'string', description: 'Job position', groupable: true },
      { name: 'fitnessStatus', path: 'fitnessStatus', type: 'string', description: 'Wellness/fitness status', groupable: true, enumValues: ['fit', 'unfit'] },
      { name: 'teamId', path: 'teamId', type: 'objectId', description: 'Team the driver belongs to' },
      { name: 'isActive', path: 'isActive', type: 'boolean', description: 'Whether the driver is active', groupable: true },
      { name: 'createdAt', path: 'createdAt', type: 'date', description: 'Record creation date', dateLike: true },
    ],
  },
  {
    path: '/api/documents',
    method: 'GET',
    description: 'Compliance documents (rego, WOF, COF, RUC, insurance, licences) with derived expiry status. Not paginated — returns all documents for the owner filter, most urgent first.',
    module: 'compliance',
    queryParameters: [
      { name: 'scope', type: 'string', required: false, description: "Owner scope: 'asset', 'driver', 'team' or 'tenant'" },
      { name: 'assetId', type: 'string', required: false, description: 'Filter by asset ObjectId (with scope=asset)' },
      { name: 'driverId', type: 'string', required: false, description: 'Filter by driver ObjectId (with scope=driver)' },
      { name: 'teamId', type: 'string', required: false, description: 'Filter by team ObjectId (with scope=team)' },
    ],
    listArrayPath: 'data.items',
    fieldSchema: [
      { name: 'id', path: 'id', type: 'objectId', description: 'Unique document identifier', isIdentifier: true },
      { name: 'title', path: 'title', type: 'string', description: 'Document title', isIdentifier: true },
      { name: 'docType', path: 'docType', type: 'string', description: 'Document type (rego, WOF, COF, RUC, insurance, …)', groupable: true },
      { name: 'scope', path: 'scope', type: 'string', description: 'Owner scope', groupable: true, enumValues: ['asset', 'driver', 'team', 'tenant'] },
      { name: 'status', path: 'status', type: 'string', description: 'Derived expiry status', groupable: true, enumValues: ['valid', 'expiring_soon', 'expired', 'no_expiry'] },
      { name: 'expiryDate', path: 'expiryDate', type: 'date', description: 'Expiry date', dateLike: true },
      { name: 'daysUntilExpiry', path: 'daysUntilExpiry', type: 'number', description: 'Days until expiry (negative = expired)', numeric: true },
      { name: 'reminderDays', path: 'reminderDays', type: 'number', description: 'Reminder lead time in days', numeric: true },
      { name: 'assetId', path: 'assetId', type: 'objectId', description: 'Owning asset (when scope=asset)', lookupRef: 'assets' },
      { name: 'createdAt', path: 'createdAt', type: 'date', description: 'Record creation date', dateLike: true },
    ],
  },
  {
    path: '/api/service-plans',
    method: 'GET',
    description: 'Paginated list of service plans (recurring schedule sets assigned to assets)',
    module: 'maintenance',
    queryParameters: PAGINATION_PARAMS,
    listArrayPath: 'data.items',
    fieldSchema: [
      { name: 'id', path: 'id', type: 'objectId', description: 'Unique service plan identifier', isIdentifier: true },
      { name: 'name', path: 'name', type: 'string', description: 'Plan name', isIdentifier: true },
      { name: 'assignedAssets', path: 'assignedAssets', type: 'number', description: 'Number of assets on this plan', numeric: true },
      { name: 'source', path: 'source', type: 'string', description: 'Where the plan came from', groupable: true },
      { name: 'isActive', path: 'isActive', type: 'boolean', description: 'Whether the plan is active', groupable: true },
      { name: 'createdAt', path: 'createdAt', type: 'date', description: 'Record creation date', dateLike: true },
    ],
  },
];

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.WIDGET_BUILDER_APP_SECRET;
  if (!expectedSecret) {
    console.error(
      '[/api/config] WIDGET_BUILDER_APP_SECRET is not set — refusing to expose API catalog',
    );
    return NextResponse.json(
      { error: 'Server misconfigured: app secret not set' },
      { status: 500 },
    );
  }

  const providedSecret = request.headers.get('x-app-secret');
  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json(
      { error: 'Unauthorized: missing or invalid X-App-Secret' },
      { status: 401 },
    );
  }

  return NextResponse.json({
    appName: 'Drive',
    version: '1.0.0',
    endpoints: ENDPOINTS,
  });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
