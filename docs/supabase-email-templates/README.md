# Supabase email templates

Paste these into Supabase → Authentication → Email Templates (hosted mode).
Password reset emails are sent by Guidon itself (`src/lib/email/resend.ts`)
in the same shape.

They are plain on purpose: a white page, text, one link, no images. Keep
account messages separate from marketing content. No template or header
can force Gmail's Primary tab: classification also depends on authentication,
sender reputation and each recipient's preferences.

Also worth checking in the Supabase dashboard, since they affect where the
mail lands too:

- Authentication → SMTP Settings: a custom SMTP (Resend) with the sender
  `Guidon <noreply@useguidon.com>` - the domain that has DKIM set up - not
  Supabase's shared default sender.
- Subject lines without words like "offer", "free", "!" - "Confirm your
  Guidon account" is fine.

## Delivery checks after deployment

1. Verify the actual sending domain in Resend. Copy its SPF and DKIM records
   exactly into DNS; keep a single SPF record per hostname and include every
   legitimate sender. Add a DMARC record with a reporting address you monitor.
2. In a received confirmation and password-reset message, open **Show original**
   and check SPF, DKIM and DMARC pass, with DMARC alignment to the visible From
   domain. A DNS record alone does not establish that a message passes.
3. Confirm Supabase SMTP uses the verified sender above. Password resets use
   `RESEND_FROM_EMAIL` independently; check both flows. Keep transactional mail
   on its own sender/subdomain, separate from campaigns, with a working Reply-To.
4. Test with dedicated Gmail and Outlook accounts. Record delivery, tab/folder,
   authentication results and Resend delivery/bounce events without storing reset
   tokens or recipient addresses in logs. A provider's delivered event means the
   receiving server accepted the message, not that it chose the inbox.
5. If authenticated messages still land in Promotions, recipients can move them
   to Primary or add the sender to contacts. Monitor reputation and complaints;
   avoid promising guaranteed inbox placement.

Guidon's password-reset mail includes both HTML and text, plus
`Auto-Submitted: auto-generated` and `X-Auto-Response-Suppress: All` to avoid
automated reply loops. These headers do not control inbox classification.
