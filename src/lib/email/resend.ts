import "server-only";
import { createTranslator } from "next-intl";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";

async function loadMessages(locale: Locale) {
  return (await import(`../../../messages/${locale}.json`)).default;
}

/** Read a required env var, or throw an error naming both it and what needs it. */
function requireEmailEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} must be set to send password reset emails. See .env.example.`
    );
  }

  return value;
}

/**
 * Same visual language as the "Confirm sign up" template shipped for
 * Supabase's dashboard in an earlier round (dark card, Guidon wordmark,
 * #1d4fd8 primary-blue button) - different copy, and a real interpolated
 * link instead of a `{{ .ConfirmationURL }}` Go-template placeholder, since
 * this is sent by our own code rather than through Supabase's template
 * engine.
 */
function passwordResetEmailHtml(
  resetLink: string,
  locale: Locale,
  t: ReturnType<typeof createTranslator>
): string {
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t("subject")}</title>
</head>
<body style="margin:0; padding:0; background-color:#0b0d10; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0d10; padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="https://useguidon.com/assets/guidon-wordmark.png" width="140" alt="Guidon" style="display:block; filter:invert(1);">
            </td>
          </tr>
          <tr>
            <td style="background-color:#101317; border:1px solid #23272e; border-radius:12px; padding:40px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:8px;">
                    <span style="font-size:20px; font-weight:600; color:#f8fafc; line-height:1.3;">
                      ${t("heading")}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <span style="font-size:14px; color:#9aa4b2; line-height:1.6;">
                      ${t("body")}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <a href="${resetLink}"
                       style="display:inline-block; background-color:#1d4fd8; color:#ffffff; font-size:14px; font-weight:600; text-decoration:none; padding:12px 28px; border-radius:8px;">
                      ${t("cta")}
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <span style="font-size:12px; color:#64748b; line-height:1.6;">
                      ${t("buttonNotWorking")}<br>
                      <a href="${resetLink}" style="color:#4d8dff; word-break:break-all;">${resetLink}</a>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:28px;">
              <span style="font-size:12px; color:#4b5563; line-height:1.6;">
                ${t("ignoreNotice")}
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Sends the password reset email through Resend's REST API directly (a
 * plain fetch, no vendor SDK dependency - same philosophy this codebase's
 * AI providers already use for the same reason). Throws on any failure;
 * the caller (requestPasswordReset in Task 2) decides how to surface that
 * without revealing whether the recipient's email has an account.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<void> {
  const apiKey = requireEmailEnv("RESEND_API_KEY");
  const from = requireEmailEnv("RESEND_FROM_EMAIL");

  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: "emails.passwordReset" });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: t("subject"),
      html: passwordResetEmailHtml(resetLink, locale, t),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API error (${response.status}): ${body || response.statusText}`);
  }
}
