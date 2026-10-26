import "server-only";
import { createTranslator } from "next-intl";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { loadMessages } from "@/i18n/load-messages";
import { SUPPORT_EMAIL } from "@/lib/project-links";

/** Read a required env var, or throw an error naming both it and what needs it. */
function requireEmailEnv(name: string, purpose: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be set to ${purpose}. See .env.example.`);
  }

  return value;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface TransactionalEmail {
  locale: Locale;
  title: string;
  heading: string;
  body: string;
  ctaLabel: string;
  link: string;
  linkHint: string;
  footer: string;
}

/**
 * A plain, text-first message: white page, system font, one link, no images
 * and a matching plain-text part. Avoid promotional content in account
 * messages. Inbox placement still depends on sender authentication,
 * reputation, and the recipient's mail provider and preferences.
 * docs/supabase-email-templates/ uses the same shape for Supabase emails.
 */
function transactionalEmailHtml(email: TransactionalEmail): string {
  const link = escapeHtml(email.link);
  return `<!DOCTYPE html>
<html lang="${email.locale}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(email.title)}</title>
</head>
<body style="margin:0; padding:24px 16px; background-color:#ffffff; color:#1f2937; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6;">
  <div style="max-width:520px; margin:0 auto;">
    <p style="margin:0 0 16px; font-size:17px; font-weight:600;">${escapeHtml(email.heading)}</p>
    <p style="margin:0 0 16px;">${escapeHtml(email.body)}</p>
    <p style="margin:0 0 24px;"><a href="${link}" style="color:#1d4fd8; font-weight:600;">${escapeHtml(email.ctaLabel)}</a></p>
    <p style="margin:0 0 24px; font-size:13px; color:#6b7280;">${escapeHtml(email.linkHint)}<br><a href="${link}" style="color:#1d4fd8; word-break:break-all;">${link}</a></p>
    <p style="margin:0; font-size:13px; color:#6b7280;">${escapeHtml(email.footer)}</p>
    <p style="margin:16px 0 0; font-size:13px; color:#6b7280;">Guidon</p>
  </div>
</body>
</html>`;
}

/** The same message as plain text - sent alongside the HTML. */
function transactionalEmailText(email: TransactionalEmail): string {
  return [email.heading, "", email.body, "", `${email.ctaLabel}: ${email.link}`, "", email.footer, "", "Guidon"].join("\n");
}

/** True when Resend is configured, so an email can actually be sent. */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim() && !!process.env.RESEND_FROM_EMAIL?.trim();
}

/**
 * Sends one transactional email through Resend's REST API directly (a
 * plain fetch, no vendor SDK dependency - same philosophy this codebase's
 * AI providers already use for the same reason). Throws on any failure.
 */
async function sendTransactionalEmail(to: string, email: TransactionalEmail, purpose: string): Promise<void> {
  const apiKey = requireEmailEnv("RESEND_API_KEY", purpose);
  const from = requireEmailEnv("RESEND_FROM_EMAIL", purpose);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      // Replies reach a person instead of bouncing off noreply@.
      reply_to: SUPPORT_EMAIL,
      headers: {
        "Auto-Submitted": "auto-generated",
        "X-Auto-Response-Suppress": "All",
      },
      subject: email.title,
      html: transactionalEmailHtml(email),
      text: transactionalEmailText(email),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API error (${response.status}): ${body || response.statusText}`);
  }
}

/**
 * The password reset email. Throws on any failure; the caller
 * (requestPasswordReset) decides how to surface that without revealing
 * whether the recipient's email has an account.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<void> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages });
  await sendTransactionalEmail(to, {
    locale,
    title: t("emails.passwordResetSubject"),
    heading: t("emails.passwordResetHeading"),
    body: t("emails.passwordResetBody"),
    ctaLabel: t("emails.passwordResetCta"),
    link: resetLink,
    linkHint: t("emails.passwordResetLinkHint"),
    footer: t("emails.passwordResetIgnoreNotice"),
  }, "send password reset emails");
}

/** An invitation to join an organization (/invite/<token>, migration 091). Throws on any failure. */
export async function sendInvitationEmail(
  to: string,
  inviteLink: string,
  details: { organizationName: string; inviterName: string; days: number },
  locale: Locale = DEFAULT_LOCALE
): Promise<void> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages });
  const values = { organization: details.organizationName, inviter: details.inviterName, days: details.days };
  await sendTransactionalEmail(to, {
    locale,
    title: t("emails.invitationSubject", values),
    heading: t("emails.invitationHeading", values),
    body: t("emails.invitationBody", values),
    ctaLabel: t("emails.invitationCta"),
    link: inviteLink,
    linkHint: t("emails.passwordResetLinkHint"),
    footer: t("emails.invitationIgnoreNotice"),
  }, "send invitation emails");
}
