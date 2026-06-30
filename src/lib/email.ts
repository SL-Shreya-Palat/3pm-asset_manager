/**
 * SendGrid email service — sends transactional emails (invitations, etc.).
 *
 * Gracefully degrades when SENDGRID_API_KEY is not configured:
 * logs a warning and returns without throwing.
 */
import sgMail from '@sendgrid/mail';
import { env } from '@/lib/env';

let initialized = false;

function ensureInitialized(): boolean {
  if (initialized) return true;
  if (!env.sendgrid) {
    console.warn('[email] SendGrid not configured — skipping email send');
    return false;
  }
  sgMail.setApiKey(env.sendgrid.apiKey);
  initialized = true;
  return true;
}

interface InvitationEmailParams {
  recipientEmail: string;
  recipientName: string;
  inviterName: string;
  tenantName: string;
  roleName: string;
  acceptUrl: string;
}

/**
 * Send an invitation email to a new user.
 * Returns true if sent successfully, false otherwise.
 */
export async function sendInvitationEmail(params: InvitationEmailParams): Promise<boolean> {
  if (!ensureInitialized()) return false;

  const { recipientEmail, recipientName, inviterName, tenantName, roleName, acceptUrl } = params;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#18181b;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">3PM Asset Manager</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#18181b;font-size:20px;font-weight:600;">You've been invited!</h2>
              <p style="margin:0 0 24px;color:#71717a;font-size:15px;line-height:1.6;">
                <strong>${inviterName}</strong> has invited you to join <strong>${tenantName}</strong> as a <strong>${roleName}</strong>.
              </p>
              <p style="margin:0 0 32px;color:#71717a;font-size:15px;line-height:1.6;">
                Click the button below to accept the invitation and get started.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${acceptUrl}" target="_blank"
                       style="display:inline-block;padding:12px 32px;background-color:#e97a1f;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:32px 0 0;color:#a1a1aa;font-size:13px;line-height:1.6;">
                This invitation will expire in 7 days. If you didn't expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e4e4e7;text-align:center;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;">
                &copy; ${new Date().getFullYear()} 3PM. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  try {
    await sgMail.send({
      to: recipientEmail,
      from: {
        email: env.sendgrid!.fromEmail,
        name: '3PM Asset Manager',
      },
      subject: `${inviterName} invited you to join ${tenantName}`,
      html,
      text: `Hi ${recipientName},\n\n${inviterName} has invited you to join ${tenantName} as a ${roleName}.\n\nAccept the invitation: ${acceptUrl}\n\nThis invitation expires in 7 days.\n\n- 3PM Asset Manager`,
    });
    console.log(`[email] Invitation sent to ${recipientEmail}`);
    return true;
  } catch (error) {
    console.error('[email] Failed to send invitation email:', error);
    return false;
  }
}
