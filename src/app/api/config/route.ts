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
    description: 'Paginated list of reported asset defects/faults',
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
    path: '/api/inspection-submissions',
    method: 'GET',
    description: 'Paginated list of completed pre-start inspection submissions',
    module: 'inspections',
    queryParameters: PAGINATION_PARAMS,
    listArrayPath: 'data.items',
  },
  {
    path: '/api/parts',
    method: 'GET',
    description: 'Paginated list of inventory parts',
    module: 'inventory',
    queryParameters: PAGINATION_PARAMS,
    listArrayPath: 'data.items',
  },
  {
    path: '/api/purchase-orders',
    method: 'GET',
    description: 'Paginated list of purchase orders',
    module: 'inventory',
    queryParameters: PAGINATION_PARAMS,
    listArrayPath: 'data.items',
  },
  {
    path: '/api/vendors',
    method: 'GET',
    description: 'Paginated list of vendors',
    module: 'vendors',
    queryParameters: PAGINATION_PARAMS,
    listArrayPath: 'data.items',
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
    appName: 'Asset Manager',
    version: '1.0.0',
    endpoints: ENDPOINTS,
  });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
