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
} from '@/lib/mongodb';
import {
  createFormBuilderSession,
  createFormBuilderMember,
} from '@/lib/form-builder-integration';
import {
  getPrestartFormTemplates,
  deriveDefectSettingsFromTemplate,
} from '@/lib/prestart-form-templates';
import { storeForm } from '@/controller/forms';
import { upsertDefectSettings } from '@/controller/defect-settings';

const FORM_BUILDER_URL =
  process.env.NEXT_PUBLIC_FORM_BUILDER_URL || 'http://localhost:3002';

// ── form-builder helpers ─────────────────────────────────────────────────────

/** Mint a form-builder session for the user (create the member on first use). */
async function getOrCreateFbSession(
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

async function fbFetch(
  path: string,
  sessionId: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
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
      { projection: { formTitle: 1 } },
    )
    .toArray();
  const seededTitles = new Set(existing.map((d) => String(d.formTitle)));

  // Nothing to do — avoid minting a form-builder session needlessly.
  if (templates.every((t) => seededTitles.has(t.title))) {
    return templates.map((t) => ({ title: t.title, status: 'already_seeded' as const }));
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
