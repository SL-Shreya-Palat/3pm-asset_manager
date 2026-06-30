/**
 * GET /api/invitations/accept?token=xxx
 *
 * Validates an invitation token and marks it as accepted.
 * Called by the /invite/accept page before redirecting to login.
 */
import { NextRequest, NextResponse } from 'next/server';
import { validateInvitationToken, acceptInvitation } from '@/controller/invitations';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.json(
      { data: null, error: 'Missing invitation token' },
      { status: 400 },
    );
  }

  const invitation = await validateInvitationToken(token);

  if (!invitation) {
    return NextResponse.json(
      { data: null, error: 'Invalid or expired invitation' },
      { status: 400 },
    );
  }

  const accepted = await acceptInvitation(token);

  if (!accepted) {
    return NextResponse.json(
      { data: null, error: 'Failed to accept invitation' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: {
      email: invitation.email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      tenantId: invitation.tenantId.toString(),
    },
    error: null,
  });
}
