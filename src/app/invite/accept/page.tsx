/**
 * /invite/accept?token=xxx
 *
 * Public page (no auth required) that validates an invitation token and
 * redirects the user to 3pm-auth login. The invitation is only marked
 * accepted AFTER the invited user authenticates — the auth callback verifies
 * the authenticated email matches the invitation before accepting it. This
 * prevents email-scanner prefetch or a wrong-account visit from consuming
 * the token.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { validateInvitationToken } from '@/controller/invitations';
import { getLoginUrl, getSession } from '@/lib/auth-3pm';
import { getAppUrl } from '@/lib/app-url';

interface PageProps {
  searchParams: Promise<{ token?: string; error?: string }>;
}

export default async function AcceptInvitationPage({ searchParams }: PageProps) {
  const { token, error } = await searchParams;

  // Wrong-account error surfaced by the auth callback: the person who
  // authenticated is not the invited user, even after a forced re-login.
  // The invitation was NOT consumed, so the link can simply be retried.
  if (error === 'account-mismatch') {
    return (
      <InvitationLayout>
        <ErrorCard
          title="Wrong Account"
          message="This invitation is for a different email address. Please try again and sign in with the email address the invitation was sent to."
          retryHref={token ? `/invite/accept?token=${encodeURIComponent(token)}` : undefined}
        />
      </InvitationLayout>
    );
  }

  // No token provided
  if (!token) {
    return (
      <InvitationLayout>
        <ErrorCard
          title="Invalid Link"
          message="This invitation link is missing a token. Please check your email and try again."
        />
      </InvitationLayout>
    );
  }

  // Validate token
  const invitation = await validateInvitationToken(token);

  if (!invitation) {
    return (
      <InvitationLayout>
        <ErrorCard
          title="Invitation Expired or Invalid"
          message="This invitation link has expired or is no longer valid. Please contact your administrator to request a new invitation."
        />
      </InvitationLayout>
    );
  }

  // Public origin, proxy-aware — never a localhost fallback in production
  // (the IdP would bounce the invited user to localhost after login).
  const hdrs = await headers();
  const forwardedHost = hdrs.get('x-forwarded-host') ?? hdrs.get('host');
  const forwardedProto = hdrs.get('x-forwarded-proto') ?? 'https';
  const appUrl = getAppUrl(
    forwardedHost ? `${forwardedProto.split(',')[0].trim()}://${forwardedHost.split(',')[0].trim()}` : null,
  );
  const invitedEmail = invitation.email.toLowerCase().trim();

  // Guard against session bleed-through. If a DIFFERENT user is already signed
  // in, the IdP's /authorize page would silently reuse their session instead of
  // authenticating the invited user. Force a full sign-out (local + IdP) and
  // re-enter this page with no active session so the invited user is prompted
  // to log in. The invitation is left 'pending' so this re-runs cleanly.
  const session = await getSession();
  const activeEmail = session?.email?.toLowerCase().trim();

  if (activeEmail && activeEmail !== invitedEmail) {
    const returnHere = `${appUrl}/invite/accept?token=${encodeURIComponent(token)}`;
    redirect(`/api/auth/switch-account?next=${encodeURIComponent(returnHere)}`);
  }

  // Redirect to 3pm-auth login → callback → /dashboard.
  // `expectedEmail` lets the callback verify the invited user is the one who
  // actually authenticated (catches an IdP session the local check couldn't see).
  // `inviteToken` lets the callback mark the invitation accepted AFTER that
  // check passes — the invitation stays 'pending' until then.
  const callbackUrl =
    `${appUrl}/api/auth/callback` +
    `?returnUrl=${encodeURIComponent(`${appUrl}/dashboard`)}` +
    `&expectedEmail=${encodeURIComponent(invitedEmail)}` +
    `&inviteToken=${encodeURIComponent(token)}`;
  const loginUrl = getLoginUrl(callbackUrl);
  redirect(loginUrl);
}

function InvitationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function ErrorCard({ title, message, retryHref }: { title: string; message: string; retryHref?: string }) {
  return (
    <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <svg
          className="h-6 w-6 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
          />
        </svg>
      </div>
      <h1 className="mb-2 text-xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      {retryHref && (
        <a
          href={retryHref}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try Again
        </a>
      )}
    </div>
  );
}
