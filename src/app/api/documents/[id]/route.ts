/**
 * GET    /api/documents/:id — get a single document
 * PUT    /api/documents/:id — update a document (also powers Renew)
 * DELETE /api/documents/:id — archive a document
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize, requireAdmin } from '@/lib/authz';
import { getDocumentById, updateDocument, deleteDocument } from '@/controller/documents';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  // Documents are cross-cutting (asset/driver/team); use asset view as the default gate.
  const auth = await authorize(request, 'assets.assets.asset', 'view');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const { id } = await context.params;
  const doc = await getDocumentById(user.currentTenantId, id);
  if (!doc) {
    return NextResponse.json({ data: null, error: 'Document not found' }, { status: 404 });
  }
  return NextResponse.json({ data: doc, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.res;
  const user = auth.user;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await updateDocument(user.currentTenantId!, user.id, id, body);
    if (result.error) {
      const status = result.error === 'Document not found' ? 404 : 400;
      return NextResponse.json({ data: null, error: result.error }, { status });
    }
    return NextResponse.json({ data: result.data, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.res;
  const user = auth.user;

  const { id } = await context.params;
  const deleted = await deleteDocument(user.currentTenantId!, user.id, id);
  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Document not found' }, { status: 404 });
  }
  return NextResponse.json({ data: { success: true }, error: null });
}
