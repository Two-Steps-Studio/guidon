# Supabase email templates

Paste these into Supabase → Authentication → Email Templates (hosted mode).
Password reset emails are sent by Guidon itself (`src/lib/email/resend.ts`)
in the same shape.

They are plain on purpose: a white page, text, one link, no images. Gmail
files mail that looks designed - a dark hero card, a logo image, a big
button - under Promotions, and a sign-up confirmation that lands there
often isn't found. Keep any new template in this style.

Also worth checking in the Supabase dashboard, since they affect where the
mail lands too:

- Authentication → SMTP Settings: a custom SMTP (Resend) with the sender
  `Guidon <noreply@useguidon.com>` - the domain that has DKIM set up - not
  Supabase's shared default sender.
- Subject lines without words like "offer", "free", "!" - "Confirm your
  Guidon account" is fine.
