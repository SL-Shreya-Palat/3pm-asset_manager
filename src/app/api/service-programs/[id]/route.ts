/**
 * GET    /api/service-programs/:id -- Get a single service program
 * PUT    /api/service-programs/:id -- Update a service program
 * DELETE /api/service-programs/:id -- Archive a service program
 * POST   /api/service-programs/:id -- Duplicate a service program (action=duplicate)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  getServiceProgramById,
  updateServiceProgram,
  deleteServiceProgram,
  duplicateServiceProgram,
} from '@/controller/service-programs';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const program = await getServiceProgramById(user.currentTenantId, id);

  if (!program) {
    return NextResponse.json({ data: null, error: 'Service program not found' }, { status: 404 });
  }

  return NextResponse.json({ data: program, error: null });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await updateServiceProgram(user.currentTenantId, user.id, id, body);

    if (result.error) {
      const status = result.error === 'Service program not found' ? 404 : 400;
      return NextResponse.json({ data: null, error: result.error }, { status });
    }

    return NextResponse.json({ data: result.data, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const deleted = await deleteServiceProgram(user.currentTenantId, user.id, id);

  if (!deleted) {
    return NextResponse.json({ data: null, error: 'Service program not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { success: true }, error: null });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const { searchParams } = request.nextUrl;
  const action = searchParams.get('action');

  if (action === 'duplicate') {
    const result = await duplicateServiceProgram(user.currentTenantId, user.id, id);
    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 404 });
    }
    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  }

  return NextResponse.json({ data: null, error: 'Unknown action' }, { status: 400 });
}
