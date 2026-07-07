/**
 * Forms Controller
 * Handles storing form creation data from form-builder-portal webhooks
 */

import { ObjectId } from 'mongodb';
import {
  getFormsCollection,
  getFormBuilderOrgMappingsCollection,
} from '@/lib/mongodb';
import { FormCreationData, FormDocument, FormResponse } from './types';

/**
 * Helper function to convert string ID to ObjectId if valid
 */
function toObjectId(id: string | undefined): ObjectId | undefined {
  if (!id) return undefined;
  if (!ObjectId.isValid(id)) {
    throw new Error(`Invalid ObjectId: ${id}`);
  }
  return new ObjectId(id);
}

/**
 * Resolve tenantId from organizationId using the formBuilderOrgMappings collection.
 */
async function getTenantIdFromOrganizationId(
  organizationId: string,
): Promise<ObjectId | null> {
  try {
    const collection = await getFormBuilderOrgMappingsCollection();
    const doc = await collection.findOne({ organizationId });
    if (!doc || !doc.tenantId) return null;
    return doc.tenantId instanceof ObjectId
      ? doc.tenantId
      : ObjectId.createFromHexString(doc.tenantId.toString());
  } catch (error) {
    console.error(
      '[FORMS_CONTROLLER] Error resolving tenantId from organizationId:',
      error,
    );
    return null;
  }
}

/**
 * Convert a FormDocument (from MongoDB) to a FormResponse (serialized for API).
 */
/**
 * Smart default for a form's inspection type when it hasn't been set explicitly
 * (legacy/builder forms). Name-based: driver/wellness/fitness → driver, else asset.
 * A stored `inspectionType` (the manual toggle) always wins over this.
 */
export function classifyInspectionType(title: string | undefined): 'asset' | 'driver' {
  return /driver|wellness|fitness|fit[\s-]?for[\s-]?duty/i.test(title || '') ? 'driver' : 'asset';
}

function toFormResponse(doc: Record<string, unknown>): FormResponse {
  const schema = doc.schema as FormDocument['schema'];
  return {
    id: (doc._id as ObjectId).toString(),
    tenantId: doc.tenantId ? (doc.tenantId as ObjectId).toString() : undefined,
    // Guard optional/legacy docs (e.g. migrated Command forms) that may be
    // missing these ids — an unguarded .toString() here 500s the whole list.
    organizationId: doc.organizationId ? (doc.organizationId as ObjectId).toString() : '',
    formId: doc.formId ? (doc.formId as ObjectId).toString() : '',
    formTitle: (doc.formTitle as string) ?? '',
    createdAt: doc.createdAt as Date,
    createdBy: doc.createdBy ? (doc.createdBy as ObjectId).toString() : '',
    type: (doc.type as string | null | undefined) || null,
    inspectionType:
      (doc.inspectionType as 'asset' | 'driver' | undefined) ||
      classifyInspectionType(doc.formTitle as string),
    status: doc.status as string,
    source: doc.source as 'app' | 'embed' | undefined,
    appId: doc.appId ? (doc.appId as ObjectId).toString() : undefined,
    schema: schema
      ? {
          formId: schema.formId,
          organizationId: schema.organizationId,
          pages: schema.pages,
          versionNumber: schema.versionNumber,
          publishedAt: schema.publishedAt,
          publishedBy: schema.publishedBy?.toString() || null,
          notes: schema.notes,
        }
      : undefined,
    createdAtPortal: doc.createdAtPortal as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

/**
 * Store form creation data from webhook
 */
export async function storeForm(data: FormCreationData): Promise<FormResponse> {
  const collection = await getFormsCollection();

  // Convert string dates to Date objects
  const createdAt =
    typeof data.createdAt === 'string'
      ? new Date(data.createdAt)
      : data.createdAt;

  // Convert string IDs to ObjectIds
  const organizationId = toObjectId(data.organizationId);
  const formId = toObjectId(data.formId);
  const createdBy = toObjectId(data.createdBy);

  if (!organizationId || !formId || !createdBy) {
    throw new Error('Invalid ObjectId in required fields');
  }

  // Get tenantId from org mappings collection
  const tenantIdObjectId = await getTenantIdFromOrganizationId(
    data.organizationId,
  );
  if (!tenantIdObjectId) {
    throw new Error(
      `TenantId not found for organizationId: ${data.organizationId}`,
    );
  }

  // Process schema if provided
  let processedSchema: FormDocument['schema'] | undefined;
  if (data.schema) {
    const publishedAt =
      data.schema.publishedAt && typeof data.schema.publishedAt === 'string'
        ? new Date(data.schema.publishedAt)
        : data.schema.publishedAt instanceof Date
          ? data.schema.publishedAt
          : null;

    const publishedBy = data.schema.publishedBy
      ? toObjectId(data.schema.publishedBy)
      : null;

    processedSchema = {
      formId: data.schema.formId,
      organizationId: data.schema.organizationId,
      pages: data.schema.pages,
      versionNumber: data.schema.versionNumber,
      publishedAt: publishedAt,
      publishedBy: publishedBy || null,
      notes: data.schema.notes,
    };
  }

  // Check if form already exists (by formId)
  const existingForm = await collection.findOne({ formId });
  const now = new Date();

  if (existingForm) {
    // Update existing form
    const updateDoc: Partial<FormDocument> = {
      tenantId: tenantIdObjectId,
      organizationId,
      formId,
      formTitle: data.formTitle,
      createdAt,
      createdBy,
      type: data.type || null,
      status: data.status,
      source: data.source,
      appId: data.appId ? toObjectId(data.appId) : undefined,
      updatedAt: now,
    };

    if (processedSchema) {
      updateDoc.schema = processedSchema;
    }
    // Only set inspectionType when explicitly provided, so a webhook re-sync
    // never clobbers a user's manual Asset/Driver choice.
    if (data.inspectionType) {
      updateDoc.inspectionType = data.inspectionType;
    }

    await collection.updateOne({ formId }, { $set: updateDoc });

    const updated = await collection.findOne({ formId });
    if (!updated) {
      throw new Error('Failed to update form');
    }

    return toFormResponse(updated);
  }

  // Create new form
  const newForm: FormDocument = {
    _id: new ObjectId(),
    tenantId: tenantIdObjectId,
    organizationId,
    formId,
    formTitle: data.formTitle,
    createdAt,
    createdBy,
    type: data.type || null,
    inspectionType: data.inspectionType || classifyInspectionType(data.formTitle),
    status: data.status,
    source: data.source,
    appId: data.appId ? toObjectId(data.appId) : undefined,
    schema: processedSchema,
    createdAtPortal: now,
    updatedAt: now,
  };

  const insertResult = await collection.insertOne(newForm);
  if (!insertResult.insertedId) {
    throw new Error('Failed to create form');
  }

  const result = await collection.findOne({ _id: insertResult.insertedId });
  if (!result) {
    throw new Error('Failed to retrieve created form');
  }

  return toFormResponse(result);
}

/**
 * Set a form's inspection type (the manual Asset/Driver toggle).
 * Matches by builder formId (ObjectId or legacy string) or _id, tenant-scoped.
 */
export async function updateFormInspectionType(
  tenantId: string,
  formId: string,
  inspectionType: 'asset' | 'driver',
): Promise<boolean> {
  const collection = await getFormsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const idVariants: (string | ObjectId)[] = [formId];
  if (ObjectId.isValid(formId)) idVariants.push(ObjectId.createFromHexString(formId));

  const filter: Record<string, unknown> = {
    tenantId: tenantOid,
    $or: [{ formId: { $in: idVariants } }, { _id: { $in: idVariants } }],
  };
  const res = await collection.updateOne(filter, {
    $set: { inspectionType, updatedAt: new Date() },
  });
  return res.matchedCount > 0;
}

/**
 * Get forms by organization ID
 */
export async function getFormsByOrganizationId(
  organizationId: string,
  limit: number = 50,
  skip: number = 0,
): Promise<{ items: FormResponse[]; total: number }> {
  const collection = await getFormsCollection();

  if (!ObjectId.isValid(organizationId)) {
    throw new Error('Invalid organizationId');
  }

  const filter = { organizationId: new ObjectId(organizationId) };
  const total = await collection.countDocuments(filter);

  const forms = await collection
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  return { items: forms.map(toFormResponse), total };
}

/**
 * Get forms by tenant ID with optional filters
 */
export async function getFormsByTenantId(
  tenantId: string,
  options: {
    status?: string;
    limit?: number;
    skip?: number;
    includeSchema?: boolean;
  } = {},
): Promise<{ items: FormResponse[]; total: number }> {
  const collection = await getFormsCollection();

  if (!ObjectId.isValid(tenantId)) {
    throw new Error('Invalid tenantId');
  }

  const { status, limit = 1000, skip = 0, includeSchema = true } = options;

  const filter: Record<string, unknown> = {
    tenantId: new ObjectId(tenantId),
  };
  if (status) {
    filter.status = status;
  }

  const total = await collection.countDocuments(filter);

  const forms = await collection
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  const items = forms.map((form) => {
    const response = toFormResponse(form);
    if (!includeSchema) {
      delete (response as Partial<FormResponse>).schema;
    }
    return response;
  });

  return { items, total };
}

/**
 * Delete form by formId
 */
export async function deleteFormByFormId(
  formId: string,
): Promise<{ success: boolean; message: string }> {
  const collection = await getFormsCollection();

  if (!ObjectId.isValid(formId)) {
    throw new Error('Invalid formId');
  }

  const result = await collection.deleteOne({
    formId: new ObjectId(formId),
  });

  if (result.deletedCount === 0) {
    return { success: false, message: 'Form not found' };
  }

  return { success: true, message: 'Form deleted successfully' };
}
