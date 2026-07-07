/**
 * Pre-start inspection form seeding.
 *
 * Seeds the pre-start form templates (Light Vehicle, Heavy Vehicle,
 * Plant / Excavator, Driver Wellness) into a tenant's form-builder org,
 * stores them locally, and pre-configures defect settings so auto-defect
 * creation works. Idempotent — templates already present are skipped.
 */
import { ObjectId } from 'mongodb';
import {
  getFormsCollection,
  getFormBuilderOrgMappingsCollection,
  getTenantsCollection,
  getTenantMembersCollection,
  getUsersCollection,
} from '@/lib/mongodb';
import {
  createFormBuilderSession,
  createFormBuilderMember,
} from '@/lib/form-builder-integration';
import {
  getPrestartFormTemplates,
  deriveDefectSettingsFromTemplate,
  PRESTART_TEMPLATE_SCHEMA_VERSION,
} from '@/lib/prestart-form-templates';
import { storeForm } from '@/controller/forms';
import { upsertDefectSettings } from '@/controller/defect-settings';

const FORM_BUILDER_URL =
  process.env.NEXT_PUBLIC_FORM_BUILDER_URL || 'http://localhost:3002';

// ── form-builder helpers ─────────────────────────────────────────────────────

/** Mint a form-builder session for the user (create the member on first use). */
export async function getOrCreateFbSession(
  userEmail: string,
  userName: string,
): Promise<{ sessionId: string; organizationId: string }> {
  let result = await createFormBuilderSession(userEmail);
  if (!result.ok && result.status === 404) {
    const parts = (userName || userEmail).split(' ');
    await createFormBuilderMember({
      email: userEmail,
      firstName: parts[0] || userEmail.split('@')[0],
      lastName: parts.slice(1).join(' ') || '-',
      ownerEmail: userEmail,
      role: 'owner',
    });
    result = await createFormBuilderSession(userEmail);
  }
  if (!result.ok || !result.data) {
    throw new Error(result.error || 'Failed to create form-builder session');
  }
  return { sessionId: result.data.sessionId, organizationId: result.data.organizationId };
}

export async function fbFetch(
  path: string,
  sessionId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown,
) {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${FORM_BUILDER_URL}/api/embed${path}${separator}sessionId=${sessionId}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `Form-builder API ${method} ${path} returned ${res.status}`);
  }
  return json.data ?? json;
}

export interface FormSeedResult {
  title: string;
  status: 'seeded' | 'already_seeded';
  formId?: string;
  version?: number;
  defectFields?: number;
}

/**
 * Seed the pre-start inspection forms for a tenant:
 *   create + publish in form-builder → store locally → write defect settings.
 * Idempotent: templates already present for the tenant are skipped.
 */
export async function seedInspectionForms(params: {
  tenantId: string;
  userId: string;
  userEmail: string;
  userName: string;
}): Promise<FormSeedResult[]> {
  const { tenantId, userId, userEmail, userName } = params;
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const templates = getPrestartFormTemplates();

  // Idempotency: skip templates already seeded for this tenant (by title).
  const formsCol = await getFormsCollection();
  const existing = await formsCol
    .find(
      { tenantId: tenantOid, formTitle: { $in: templates.map((t) => t.title) } },
      { projection: { formTitle: 1, formId: 1, templateSchemaVersion: 1 } },
    )
    .toArray();
  const seededTitles = new Set(existing.map((d) => String(d.formTitle)));

  // Check if any existing forms have a stale schema version.
  const hasStale = existing.some(
    (d) => (d.templateSchemaVersion ?? 1) < PRESTART_TEMPLATE_SCHEMA_VERSION,
  );

  // Nothing to do — avoid minting a form-builder session needlessly.
  if (templates.every((t) => seededTitles.has(t.title)) && !hasStale) {
    return templates.map((t) => ({ title: t.title, status: 'already_seeded' as const }));
  }

  // Auto-update stale forms before seeding new ones.
  if (hasStale) {
    await updateInspectionForms({ tenantId, userId, userEmail, userName });
  }

  const { sessionId, organizationId } = await getOrCreateFbSession(userEmail, userName);

  // Ensure the org→tenant mapping exists so storeForm can resolve the tenant.
  if (organizationId) {
    const orgCol = await getFormBuilderOrgMappingsCollection();
    await orgCol.updateOne(
      { organizationId },
      {
        $set: { organizationId, tenantId: tenantOid, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
  }

  const results: FormSeedResult[] = [];

  for (const template of templates) {
    if (seededTitles.has(template.title)) {
      results.push({ title: template.title, status: 'already_seeded' });
      continue;
    }

    // 1. Create → 2. set schema → 3. publish (in form-builder).
    const created = await fbFetch('/forms', sessionId, 'POST', { title: template.title });
    const formId: string = created.id;
    await fbFetch(`/forms/${formId}/schema`, sessionId, 'PUT', { pages: template.pages });
    const published = await fbFetch(`/forms/${formId}/publish`, sessionId, 'POST', {
      notes: `Seeded pre-start template: ${template.title}`,
    });
    const versionNumber: number = published.currentPublishedVersion ?? 1;

    // 4. Store locally immediately (don't depend on the async publish webhook).
    await storeForm({
      organizationId,
      formId,
      formTitle: template.title,
      createdAt: new Date(),
      createdBy: userId,
      status: 'published',
      source: 'embed',
      inspectionType: template.templateKey === 'driver_wellness' ? 'driver' : 'asset',
      schema: {
        formId,
        organizationId,
        pages: template.pages,
        versionNumber,
        publishedAt: new Date(),
        publishedBy: userId,
        notes: `Seeded pre-start template: ${template.title}`,
      },
    });

    // Stamp the schema version so future seeds can detect stale templates.
    const formOid = ObjectId.isValid(formId) ? ObjectId.createFromHexString(formId) : formId;
    await formsCol.updateOne(
      { tenantId: tenantOid, formId: formOid },
      { $set: { templateSchemaVersion: PRESTART_TEMPLATE_SCHEMA_VERSION } },
    );

    // 5. Pre-configure defect settings (mark Fail etc. as defects).
    //    Use template-specific settings when available (e.g. driver wellness
    //    where "yes" can be a bad answer), otherwise auto-derive from options.
    const { defectAnswers, severityByField } = template.customDefectSettings
      ?? deriveDefectSettingsFromTemplate(template);
    await upsertDefectSettings(tenantId, userId, formId, { defectAnswers, severityByField });

    results.push({
      title: template.title,
      status: 'seeded',
      formId,
      version: versionNumber,
      defectFields: Object.keys(defectAnswers).length,
    });
  }

  return results;
}

// ── update existing forms ────────────────────────────────────────────────────

export interface FormUpdateResult {
  title: string;
  status: 'updated' | 'not_found';
  formId?: string;
  version?: number;
}

/**
 * Update already-seeded pre-start forms with the latest template schemas.
 * For each template that has a corresponding local form, this will:
 *   1. PUT the updated schema to form-builder
 *   2. Re-publish the form
 *   3. Update the local DB record
 *   4. Re-derive and upsert defect settings
 */
export async function updateInspectionForms(params: {
  tenantId: string;
  userId: string;
  userEmail: string;
  userName: string;
}): Promise<FormUpdateResult[]> {
  const { tenantId, userId, userEmail, userName } = params;
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const templates = getPrestartFormTemplates();

  const formsCol = await getFormsCollection();
  const existingForms = await formsCol
    .find(
      { tenantId: tenantOid, formTitle: { $in: templates.map((t) => t.title) } },
      { projection: { formTitle: 1, formId: 1 } },
    )
    .toArray();

  const formsByTitle = new Map<string, { idStr: string; idOid: ObjectId }>();
  for (const f of existingForms) {
    const idStr = f.formId instanceof ObjectId ? f.formId.toHexString() : String(f.formId);
    const idOid = f.formId instanceof ObjectId ? f.formId : ObjectId.createFromHexString(idStr);
    formsByTitle.set(String(f.formTitle), { idStr, idOid });
  }

  // Nothing to update
  if (formsByTitle.size === 0) {
    return templates.map((t) => ({ title: t.title, status: 'not_found' as const }));
  }

  const { sessionId } = await getOrCreateFbSession(userEmail, userName);

  const results: FormUpdateResult[] = [];

  for (const template of templates) {
    const entry = formsByTitle.get(template.title);
    if (!entry) {
      results.push({ title: template.title, status: 'not_found' });
      continue;
    }
    const { idStr: formId, idOid: formOid } = entry;

    // 1. Update schema in form-builder
    await fbFetch(`/forms/${formId}/schema`, sessionId, 'PUT', { pages: template.pages });

    // 2. Re-publish
    const published = await fbFetch(`/forms/${formId}/publish`, sessionId, 'POST', {
      notes: `Updated pre-start template: ${template.title}`,
    });
    const versionNumber: number = published.currentPublishedVersion ?? 1;

    // 3. Update local DB record with new schema + version marker
    await formsCol.updateOne(
      { tenantId: tenantOid, formId: formOid },
      {
        $set: {
          templateSchemaVersion: PRESTART_TEMPLATE_SCHEMA_VERSION,
          'schema.pages': template.pages,
          'schema.versionNumber': versionNumber,
          'schema.publishedAt': new Date(),
          'schema.publishedBy': userId,
          'schema.notes': `Updated pre-start template: ${template.title}`,
        },
      },
    );

    // 4. Re-derive and upsert defect settings
    const { defectAnswers, severityByField } = template.customDefectSettings
      ?? deriveDefectSettingsFromTemplate(template);
    await upsertDefectSettings(tenantId, userId, formId, { defectAnswers, severityByField });

    results.push({
      title: template.title,
      status: 'updated',
      formId,
      version: versionNumber,
    });
  }

  return results;
}

// ── bulk migration across all tenants ────────────────────────────────────────

export interface TenantMigrationResult {
  tenantId: string;
  tenantName: string;
  status: 'updated' | 'skipped' | 'error';
  forms?: FormUpdateResult[];
  error?: string;
}

/**
 * Migrate pre-start form schemas for ALL tenants that have stale templates.
 * For each tenant:
 *   1. Check if any seeded prestart forms have an older templateSchemaVersion
 *   2. Find an admin/owner member to mint a form-builder session
 *   3. Call updateInspectionForms to push the latest schemas
 *
 * Safe to call repeatedly — tenants already at the current version are skipped.
 */
export async function migrateAllTenantPrestartForms(): Promise<TenantMigrationResult[]> {
  const tenantsCol = await getTenantsCollection();
  const formsCol = await getFormsCollection();
  const membersCol = await getTenantMembersCollection();
  const usersCol = await getUsersCollection();

  const templates = getPrestartFormTemplates();
  const templateTitles = templates.map((t) => t.title);

  // Find all tenants that have at least one prestart form with a stale version.
  const staleForms = await formsCol
    .find({
      formTitle: { $in: templateTitles },
      $or: [
        { templateSchemaVersion: { $lt: PRESTART_TEMPLATE_SCHEMA_VERSION } },
        { templateSchemaVersion: { $exists: false } },
      ],
    })
    .toArray();

  // Unique tenant IDs that need updating.
  const staleTenantIds = [...new Set(staleForms.map((f) => f.tenantId.toHexString()))];

  if (staleTenantIds.length === 0) {
    return [];
  }

  const results: TenantMigrationResult[] = [];

  for (const tenantId of staleTenantIds) {
    const tenantOid = ObjectId.createFromHexString(tenantId);

    // Look up tenant name for logging.
    const tenant = await tenantsCol.findOne({ _id: tenantOid });
    const tenantName = (tenant?.name as string) || tenantId;

    // Find an active member for this tenant (prefer the oldest = likely the owner).
    const member = await membersCol.findOne(
      { tenantId: tenantOid, isActive: true },
      { sort: { createdAt: 1 } },
    );

    if (!member) {
      results.push({ tenantId, tenantName, status: 'error', error: 'No active member found' });
      continue;
    }

    // Resolve the user's email.
    const user = member.userId
      ? await usersCol.findOne({ _id: member.userId instanceof ObjectId ? member.userId : ObjectId.createFromHexString(String(member.userId)) })
      : null;

    const email = (user?.email as string) || (member.email as string);
    const name = user
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || email
      : (member.firstName as string) || email;

    if (!email) {
      results.push({ tenantId, tenantName, status: 'error', error: 'No email found for member' });
      continue;
    }

    try {
      const forms = await updateInspectionForms({
        tenantId,
        userId: member.userId ? String(member.userId) : String(member._id),
        userEmail: email,
        userName: name,
      });

      results.push({ tenantId, tenantName, status: 'updated', forms });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[MIGRATE_PRESTART] Failed for tenant ${tenantName} (${tenantId}):`, message);
      results.push({ tenantId, tenantName, status: 'error', error: message });
    }
  }

  return results;
}
