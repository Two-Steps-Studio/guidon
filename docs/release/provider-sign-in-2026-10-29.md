# Google and GitHub sign-in - 2026-10-29

## Configuration completed

- Created the Google Cloud project `guidon-sign-in` and web OAuth client `Guidon Sign-in` after owner approval.
- Configured the exact provider callback: `https://thtzaeeatjwyitifdcxb.supabase.co/auth/v1/callback`.
- Stored the Google client credentials directly in Supabase; no client secret belongs in repository files or public environment variables.
- Enabled Google in Supabase while keeping nonce checks and the email requirement active.
- Added `http://localhost:5803/auth/callback?redirect=**` to the redirect allowlist. The wildcard is confined to the callback query value, with a fixed scheme, host, port and path.
- Google remains in Testing with the owner's account listed as a test user. Public homepage, privacy policy and terms URLs are configured. No billing was activated.
- Local `.env.local` enables only `NEXT_PUBLIC_AUTH_PROVIDERS=google`. GitHub remains hidden until its backend configuration is complete.

## Verified

The local Google button reaches Google's account chooser and consent page with the configured web client, exact Supabase callback, a localhost return URL and `email profile` scopes. This proves the authorization redirect, not token exchange or session creation.

## Remaining work

1. The owner must complete GitHub's 2FA challenge on the computer before the first secret can be generated for the existing `Guidon Sign-in` OAuth app. Do not change the older repository-integration OAuth app.
2. Save the new GitHub credentials directly in Supabase and enable GitHub with the email requirement retained.
3. Complete real Google and GitHub consent, callback, session reload, cancellation and existing-account checks. Do not count reaching the consent page as a successful full login.
4. Review Google's testing/production and verification requirements before opening Google login to all users. Do not publish without owner approval.
5. Once the backend providers are ready, set the hosting environment's `NEXT_PUBLIC_AUTH_PROVIDERS` to the ready providers and rebuild with production approval. A local environment change does not enable production buttons.

No application production deployment or database migration was performed for this setup.
