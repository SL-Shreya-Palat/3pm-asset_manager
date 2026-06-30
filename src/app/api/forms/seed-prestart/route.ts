/**
 * POST /api/forms/seed-prestart
 *
 * Seeds the three pre-start inspection form templates (Light Vehicle, Heavy
 * Vehicle, Plant / Excavator) into the form-builder-portal via its embed API.
 *
 * Flow per template:
 *   1. Create form  → POST  /api/embed/forms
 *   2. Update schema → PUT   /api/embed/forms/[id]/schema
 *   3. Publish form  → POST  /api/embed/forms/[id]/publish
 *
 * The form-builder-portal's publish webhook then syncs the form back to
 * the asset-manager's local `forms` collection automatically.
 *
 * Requires an authenticated user with a valid tenant.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { createFormBuilderSession, createFormBuilderMember } from '@/lib/form-builder-integration';
import { getPrestartFormTemplates } from '@/lib/prestart-form-templates';

const FORM_BUILDER_URL =
  process.env.NEXT_PUBLIC_FORM_BUILDER_URL || 'http://localhost:3002';

// ── helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateSession(userEmail: string, userName: string) {
  let result = await createFormBuilderSession(userEmail);

  // If user not found, create them and retry
  if (!result.ok && result.status === 404) {
    const nameParts = (userName || userEmail).split(' ');
    const firstName = nameParts[0] || userEmail.split('@')[0];
    const lastName = nameParts.slice(1).join(' ') || '-';

    await createFormBuilderMember({
      email: userEmail,
      firstName,
      lastName,
      ownerEmail: userEmail,
      role: 'owner',
    });

    result = await createFormBuilderSession(userEmail);
  }

  if (!result.ok || !result.data) {
    throw new Error(result.error || 'Failed to create form-builder session');
  }

  return result.data.sessionId;
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
    throw new Error(
      json.error || `Form-builder API ${method} ${path} returned ${res.status}`,
    );
  }

  return json.data ?? json;
}

// ── route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate
    const user = await getAuthenticatedUser(req);

    if (!user?.id || !user.email) {
      return NextResponse.json(
        { data: null, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    if (!user.currentTenantId) {
      return NextResponse.json(
        { data: null, error: 'User is not associated with any tenant' },
        { status: 404 },
      );
    }

    // 2. Obtain an embed session on the form-builder-portal
    const sessionId = await getOrCreateSession(
      user.email,
      user.name || user.email,
    );

    // 3. Seed each template
    const templates = getPrestartFormTemplates();
    const results: { title: string; formId: string; status: string; version: number }[] = [];

    for (const template of templates) {
      // 3a. Create the form
      const created = await fbFetch('/forms', sessionId, 'POST', {
        title: template.title,
      });

      const formId: string = created.id;

      // 3b. Update the draft schema with pages & fields
      await fbFetch(`/forms/${formId}/schema`, sessionId, 'PUT', {
        pages: template.pages,
      });

      // 3c. Publish the form (triggers webhook to asset-manager)
      const published = await fbFetch(
        `/forms/${formId}/publish`,
        sessionId,
        'POST',
        { notes: `Seeded pre-start template: ${template.title}` },
      );

      results.push({
        title: template.title,
        formId,
        status: 'published',
        version: published.currentPublishedVersion ?? 1,
      });
    }

    return NextResponse.json(
      {
        data: {
          message: `Successfully seeded ${results.length} pre-start form(s)`,
          forms: results,
        },
        error: null,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to seed pre-start forms';
    console.error('[SEED_PRESTART]', error);
    return NextResponse.json(
      { data: null, error: message },
      { status: 500 },
    );
  }
}
