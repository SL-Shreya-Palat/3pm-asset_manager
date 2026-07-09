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
  FORM_BUILDER_APP_NAME,
  createFormBuilderSession,
  createFormBuilderMember,
  onboardFormBuilderTenant,
} from '@/lib/form-builder-integration';
import {
  getEmbedTokenForTenant,
  storeEmbedToken,
} from '@/lib/embed-token-storage';
import {
  getPrestartFormTemplates,
  deriveDefectSettingsFromTemplate,
  PRESTART_TEMPLATE_SCHEMA_VERSION,
} from '@/lib/prestart-form-templates';
import { upsertDefectSettings } from '@/controller/defect-settings';

const FORM_BUILDER_URL =
  process.env.NEXT_PUBLIC_FORM_BUILDER_URL || 'http://localhost:3002';

// ── form-builder helpers ─────────────────────────────────────────────────────

/**
 * Resolve (or create) the embed token for a tenant.
 * If no token exists, onboards the tenant to form-builder first.
 */
async function resolveEmbedToken(
  tenantId: string,
  userEmail: string,
  userName: string,
): Promise<string> {
  const existing = await getEmbedTokenForTenant(tenantId, FORM_BUILDER_APP_NAME);
  if (existing) return existing;

  const tenantsCol = await getTenantsCollection();
  const tenant = await tenantsCol.findOne({
    _id: ObjectId.createFromHexString(tenantId),
  });

  const organizationName =
    tenant?.name?.toString?.() || userName || userEmail.split('@')[0] || 'My Organization';
  const parts = (userName || userEmail).split(' ');
  const firstName = parts[0] || userEmail.split('@')[0];
  const lastName = parts.slice(1).join(' ') || '-';

  const onboardResult = await onboardFormBuilderTenant({
    email: userEmail,
    firstName,
    lastName,
    organizationName,
  });

  if (!onboardResult) {
    throw new Error('Failed to onboard tenant to form-builder');
  }

  await storeEmbedToken(
    tenantId,
    onboardResult.organizationId,
    onboardResult.token,
    onboardResult.tokenId,
    FORM_BUILDER_APP_NAME,
  );

  return onboardResult.token;
}

/** Mint a form-builder session for the user (create the member on first use). */
export async function getOrCreateFbSession(
  userEmail: string,
  userName: string,
  embedToken: string,
): Promise<{ sessionId: string; organizationId: string }> {
  let result = await createFormBuilderSession({ userEmail, embedToken });
  if (!result.ok && result.status === 404) {
    const parts = (userName || userEmail).split(' ');
    await createFormBuilderMember({
      email: userEmail,
      firstName: parts[0] || userEmail.split('@')[0],
      lastName: parts.slice(1).join(' ') || '-',
      ownerEmail: userEmail,
      embedToken,
      role: 'owner',
    });
    result = await createFormBuilderSession({ userEmail, embedToken });
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
 * Remove duplicate forms from the form-builder service.
 * Groups all forms by title, checks which form IDs the local DB references,
 * keeps referenced forms (falling back to the newest), and deletes the rest.
 * Also updates local DB records if their referenced form was deleted.
 * Returns the number of duplicates removed.
 */
export async function cleanupDuplicateFormBuilderForms(params: {
  tenantId: string;
  userEmail: string;
  userName: string;
}): Promise<number> {
  const embedToken = await resolveEmbedToken(params.tenantId, params.userEmail, params.userName);
  const { sessionId } = await getOrCreateFbSession(params.userEmail, params.userName, embedToken);
  let removed = 0;
  try {
    const fbForms = await fbFetch('/forms', sessionId, 'GET');
    const list = Array.isArray(fbForms) ? fbForms : (fbForms?.items ?? []);

    // Group all form-builder forms by title.
    const formsByTitle = new Map<string, Array<{ id: string; createdAt?: string }>>();
    for (const f of list) {
      const title: string = f.title || f.formTitle || '';
      const id: string = f.id || f._id || '';
      if (!title || !id) continue;
      if (!formsByTitle.has(title)) formsByTitle.set(title, []);
      formsByTitle.get(title)!.push({ id: String(id), createdAt: f.createdAt });
    }

    // Only process titles that actually have duplicates.
    const titlesWithDupes = [...formsByTitle.entries()].filter(([, forms]) => forms.length > 1);
    if (titlesWithDupes.length === 0) return 0;

    // Fetch local DB form records to know which form-builder IDs are referenced.
    const formsCol = await getFormsCollection();
    const localForms = await formsCol
      .find(
        { formTitle: { $in: titlesWithDupes.map(([title]) => title) } },
        { projection: { formTitle: 1, formId: 1, tenantId: 1 } },
      )
      .toArray();

    // Build a set of referenced form-builder IDs (as strings).
    const referencedIds = new Set<string>();
    for (const lf of localForms) {
      const id = lf.formId instanceof ObjectId ? lf.formId.toHexString() : String(lf.formId);
      referencedIds.add(id);
    }

    // For each title with duplicates, keep the referenced form and delete the rest.
    for (const [title, forms] of titlesWithDupes) {
      // Sort newest first so we prefer keeping the newest if none are referenced.
      forms.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      // Prefer keeping a form that the local DB references.
      const referencedForm = forms.find((f) => referencedIds.has(f.id));
      const keepId = referencedForm ? referencedForm.id : forms[0].id;

      for (const form of forms) {
        if (form.id === keepId) continue;
        try {
          await fbFetch(`/forms/${form.id}`, sessionId, 'DELETE');
          removed++;
        } catch {
          // Best-effort: form may already be deleted.
        }
      }

      // If local DB records point to a form that was deleted, update them
      // to reference the surviving form.
      if (keepId) {
        const keepOid = ObjectId.isValid(keepId) ? ObjectId.createFromHexString(keepId) : new ObjectId(keepId);
        const deletedIds = forms.filter((f) => f.id !== keepId).map((f) => f.id);
        for (const lf of localForms) {
          const lfFormId = lf.formId instanceof ObjectId ? lf.formId.toHexString() : String(lf.formId);
          if (String(lf.formTitle) === title && deletedIds.includes(lfFormId)) {
            await formsCol.updateOne(
              { _id: lf._id },
              { $set: { formId: keepOid, 'schema.formId': keepId, updatedAt: new Date() } },
            );
          }
        }
      }
    }
  } catch {
    // Best-effort cleanup.
  }
  return removed;
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

  // Auto-update stale forms before seeding new ones.
  if (hasStale) {
    await updateInspectionForms({ tenantId, userId, userEmail, userName });
  }

  const embedToken = await resolveEmbedToken(tenantId, userEmail, userName);
  const { sessionId, organizationId } = await getOrCreateFbSession(userEmail, userName, embedToken);

  // Ensure the org→tenant mapping exists.
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

  // ── Cross-org idempotency ──────────────────────────────────────────────
  // All tenants share the same form-builder organization (single embed
  // token), so forms created by one tenant appear for everyone in the
  // iframe. Fetch existing FB forms to avoid creating duplicates when a
  // new tenant (or a concurrent seed call) triggers seeding.
  // Note: duplicate cleanup is handled by cleanupDuplicateFormBuilderForms().
  const fbFormsByTitle = new Map<string, string>();
  try {
    const fbForms = await fbFetch('/forms', sessionId, 'GET');
    const list = Array.isArray(fbForms) ? fbForms : (fbForms?.items ?? []);
    for (const f of list) {
      const title: string = f.title || f.formTitle || '';
      const id: string = f.id || f._id || '';
      if (title && id) fbFormsByTitle.set(title, String(id));
    }
  } catch {
    // If the check fails, fall through to creation (worst case: a duplicate).
  }

  // Check for orphaned local references — forms that exist locally but whose
  // form-builder counterpart was deleted (e.g. by a previous cleanup).
  // Remove these from seededTitles so the seeding loop re-processes them
  // (reusing an existing FB form with the same title, or creating a new one).
  const fbIdSet = new Set(fbFormsByTitle.values());
  for (const doc of existing) {
    const localFbId = doc.formId instanceof ObjectId ? doc.formId.toHexString() : String(doc.formId);
    if (!fbIdSet.has(localFbId)) {
      seededTitles.delete(String(doc.formTitle));
    }
  }

  const results: FormSeedResult[] = [];

  for (const template of templates) {
    if (seededTitles.has(template.title)) {
      results.push({ title: template.title, status: 'already_seeded' });
      continue;
    }

    let formId: string;
    let versionNumber: number;

    // Check if this form already exists in the form-builder org (e.g.
    // seeded by another tenant or a concurrent request).
    const existingFbId = fbFormsByTitle.get(template.title);

    if (existingFbId) {
      // Reuse the existing form-builder form — don't create a duplicate.
      formId = existingFbId;
      versionNumber = 1;
    } else {
      // 1. Create → 2. set schema → 3. publish (in form-builder).
      const created = await fbFetch('/forms', sessionId, 'POST', { title: template.title });
      formId = created.id;
      await fbFetch(`/forms/${formId}/schema`, sessionId, 'PUT', { pages: template.pages });
      const published = await fbFetch(`/forms/${formId}/publish`, sessionId, 'POST', {
        notes: `Seeded pre-start template: ${template.title}`,
      });
      versionNumber = published.currentPublishedVersion ?? 1;
    }

    // 4. Store locally — use a tenant-scoped upsert so that multiple
    //    tenants sharing the same FB form each get their own local record
    //    without overwriting each other.
    const formOid = ObjectId.isValid(formId) ? ObjectId.createFromHexString(formId) : new ObjectId(formId);
    const orgOid = ObjectId.isValid(organizationId) ? ObjectId.createFromHexString(organizationId) : undefined;

    await formsCol.updateOne(
      { tenantId: tenantOid, formTitle: template.title },
      {
        $set: {
          organizationId: orgOid,
          formId: formOid,
          status: 'published',
          source: 'embed',
          inspectionType: template.templateKey === 'driver_wellness' ? 'driver' : 'asset',
          templateSchemaVersion: PRESTART_TEMPLATE_SCHEMA_VERSION,
          schema: {
            formId,
            organizationId,
            pages: template.pages,
            versionNumber,
            publishedAt: new Date(),
            publishedBy: userId,
            notes: `Seeded pre-start template: ${template.title}`,
          },
          updatedAt: new Date(),
        },
        $setOnInsert: {
          _id: new ObjectId(),
          tenantId: tenantOid,
          formTitle: template.title,
          createdBy: ObjectId.createFromHexString(userId),
          createdAt: new Date(),
          createdAtPortal: new Date(),
        },
      },
      { upsert: true },
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

  const embedToken = await resolveEmbedToken(tenantId, userEmail, userName);
  const { sessionId } = await getOrCreateFbSession(userEmail, userName, embedToken);

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
