/**
 * Transactional email service (invitations, etc.).
 *
 * Delivers via the first available provider in priority order:
 * Resend → SendGrid → Gmail. Each provider is only used when configured, and a
 * failure falls through to the next so a single broken provider never blocks
 * email. Gracefully degrades to a warning + no-op when nothing is configured.
 */
import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { env } from '@/lib/env';

const resendClient = env.resend ? new Resend(env.resend.apiKey) : null;

let sendgridInitialized = false;
function ensureSendgrid(): boolean {
  if (!env.sendgrid) return false;
  if (!sendgridInitialized) {
    sgMail.setApiKey(env.sendgrid.apiKey);
    sendgridInitialized = true;
  }
  return true;
}

interface NormalizedMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
}

async function sendViaResend(msg: NormalizedMessage): Promise<void> {
  const from = msg.fromName
    ? `${msg.fromName} <${env.resend!.fromEmail}>`
    : env.resend!.fromEmail;
  const { error } = await resendClient!.emails.send({
    from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  });
  // Resend resolves with { data, error } rather than throwing, so surface the
  // error ourselves to trigger the fallback chain.
  if (error) {
    throw new Error(
      `${error.name || 'resend_error'}: ${error.message || 'Unknown Resend error'}`,
    );
  }
}

async function sendViaSendgrid(msg: NormalizedMessage): Promise<void> {
  ensureSendgrid();
  await sgMail.send({
    to: msg.to,
    from: msg.fromName
      ? { name: msg.fromName, email: env.sendgrid!.fromEmail }
      : env.sendgrid!.fromEmail,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  });
}

async function sendViaGmail(msg: NormalizedMessage): Promise<void> {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: env.gmail!.user, pass: env.gmail!.appPassword },
  });
  await transporter.sendMail({
    from: `"${msg.fromName || '3PM'}" <${env.gmail!.user}>`,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  });
}

/** Pull the most useful, human-readable detail out of a provider error. */
function providerErrorDetail(error: unknown): unknown {
  const sgErrors = (error as { response?: { body?: { errors?: unknown } } })
    ?.response?.body?.errors;
  if (sgErrors) return sgErrors;
  return error instanceof Error ? error.message : error;
}

/**
 * Send an email via the first available provider (Resend → SendGrid → Gmail),
 * falling through on failure. Returns true on success, false otherwise.
 */
async function dispatchEmail(msg: NormalizedMessage): Promise<boolean> {
  const providers: Array<{
    name: string;
    send: (m: NormalizedMessage) => Promise<void>;
  }> = [];
  if (env.resend) providers.push({ name: 'Resend', send: sendViaResend });
  if (env.sendgrid) providers.push({ name: 'SendGrid', send: sendViaSendgrid });
  if (env.gmail) providers.push({ name: 'Gmail', send: sendViaGmail });

  if (providers.length === 0) {
    console.warn('[email] No email provider configured — skipping email send');
    return false;
  }

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      await provider.send(msg);
      return true;
    } catch (error) {
      console.error(
        `[email] ${provider.name} send failed:`,
        providerErrorDetail(error),
      );
      const next = providers[i + 1];
      if (next) console.warn(`[email] Falling back to ${next.name}…`);
    }
  }

  return false;
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
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">3PM Drive</h1>
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

  const sent = await dispatchEmail({
    to: recipientEmail,
    fromName: '3PM Drive',
    subject: `${inviterName} invited you to join ${tenantName}`,
    html,
    text: `Hi ${recipientName},\n\n${inviterName} has invited you to join ${tenantName} as a ${roleName}.\n\nAccept the invitation: ${acceptUrl}\n\nThis invitation expires in 7 days.\n\n- 3PM Drive`,
  });

  if (sent) {
    console.log(`[email] Invitation sent to ${recipientEmail}`);
  } else {
    console.error(`[email] Failed to send invitation email to ${recipientEmail}`);
  }
  return sent;
}
