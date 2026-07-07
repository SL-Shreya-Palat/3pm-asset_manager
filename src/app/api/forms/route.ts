import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  getFormsByTenantId,
  getFormsByOrganizationId,
  storeForm,
} from '@/controller/forms';
import { FormCreationData } from '@/controller/forms/types';

/**
 * GET /api/forms
 *
 * Fetch forms for the authenticated user's tenant.
 * Query parameters:
 * - status: Filter by form status (default: all)
 * - limit: Maximum number of forms to return (default: 1000)
 * - skip: Number of forms to skip (default: 0)
 * - includeSchema: Include form schemas in response (default: true)
 * - organizationId: Filter by organization ID (optional)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);

    if (!user?.id) {
      return NextResponse.json(
        { data: null, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const tenantId = user.currentTenantId;

    if (!tenantId) {
      return NextResponse.json(
        { data: null, error: 'User is not associated with any tenant' },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const limit = parseInt(searchParams.get('limit') || '1000');
    const skip = parseInt(searchParams.get('skip') || '0');
    const includeSchema = searchParams.get('includeSchema') !== 'false';
    const organizationId = searchParams.get('organizationId') || undefined;

    let result;

    if (organizationId) {
      result = await getFormsByOrganizationId(organizationId, limit, skip);
    } else {
      result = await getFormsByTenantId(tenantId, {
        status,
        limit,
        skip,
        includeSchema,
      });
    }

    const items = result.items.map((form) => ({
      id: form.id,
      formId: form.formId,
      title: form.formTitle,
      type: form.type || '',
      typeName: form.type || '',
      inspectionType: form.inspectionType,
      organizationId: form.organizationId,
      status: form.status,
      createdAt: form.createdAt instanceof Date ? form.createdAt.toISOString() : form.createdAt,
      updatedAt: form.updatedAt instanceof Date ? form.updatedAt.toISOString() : form.updatedAt,
      publishedAt: form.schema?.publishedAt
        ? form.schema.publishedAt instanceof Date
          ? form.schema.publishedAt.toISOString()
          : form.schema.publishedAt
        : form.createdAt instanceof Date
          ? form.createdAt.toISOString()
          : form.createdAt,
      currentPublishedVersion: form.schema?.versionNumber || 1,
      totalVersions: 1,
      currentSchema:
        includeSchema && form.schema
          ? {
              formId: form.formId,
              pages: form.schema.pages,
              versionNumber: form.schema.versionNumber || 1,
              publishedAt: form.schema.publishedAt
                ? form.schema.publishedAt instanceof Date
                  ? form.schema.publishedAt.toISOString()
                  : form.schema.publishedAt
                : undefined,
            }
          : null,
      publishedSchema:
        includeSchema && form.schema
          ? {
              formId: form.formId,
              pages: form.schema.pages,
              versionNumber: form.schema.versionNumber || 1,
              publishedAt: form.schema.publishedAt
                ? form.schema.publishedAt instanceof Date
                  ? form.schema.publishedAt.toISOString()
                  : form.schema.publishedAt
                : undefined,
            }
          : null,
    }));

    return NextResponse.json(
      {
        data: {
          items,
          pagination: {
            page: Math.floor(skip / limit) + 1,
            limit,
            totalCount: result.total,
            totalPages: Math.ceil(result.total / limit),
          },
        },
        error: null,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch forms';
    console.error('Error fetching forms:', error);
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 },
    );
  }
}

/**
 * POST /api/forms
 *
 * Create a new form.
 * Body: FormCreationData
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);

    if (!user?.id) {
      return NextResponse.json(
        { data: null, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const body: FormCreationData = await req.json();

    if (
      !body.organizationId ||
      !body.formId ||
      !body.formTitle ||
      !body.createdBy ||
      !body.status
    ) {
      return NextResponse.json(
        {
          data: null,
          error:
            'Missing required fields: organizationId, formId, formTitle, createdBy, or status',
        },
        { status: 400 },
      );
    }

    const form = await storeForm(body);

    return NextResponse.json(
      { data: form, error: null },
      { status: 201 },
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to create form';
    console.error('Error creating form:', error);
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 },
    );
  }
}
