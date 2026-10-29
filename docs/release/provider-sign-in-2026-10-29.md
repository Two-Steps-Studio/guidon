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

The local Google button reaches Google's account chooser and consent page with the configured web client, exact Supabase callback, a localhost return URL and `email profile` scopes.

After the owner explicitly approved sharing the selected account's basic profile, a fresh authorization completed through Supabase and returned to `http://localhost:5803/dashboard` with the account recognized by the authenticated app shell. Reload preserved the session and led to onboarding for the new account. A subsequent request to the protected `/profile` page also rendered the authenticated app shell and logout control. No organization or project was created for this test.

The earlier authorization, left open while awaiting approval, was rejected with `bad_oauth_state` / `OAuth state has expired`. A new flow succeeded; no state validation was disabled or bypassed.

These observations verify the real Google callback, token exchange and persisted local session for one new-account flow. They do not verify production frontend enablement, GitHub, cancellation or linking an existing account.

## Remaining work

1. The owner must complete GitHub's 2FA challenge on the computer before the first secret can be generated for the existing `Guidon Sign-in` OAuth app. Do not change the older repository-integration OAuth app.
2. Save the new GitHub credentials directly in Supabase and enable GitHub with the email requirement retained.
3. Complete GitHub consent, callback and session reload. Cancellation and existing-account linking checks remain for both providers; the new-account Google flow and persisted local session passed.
4. Review Google's testing/production and verification requirements before opening Google login to all users. Do not publish without owner approval.
5. Once the backend providers are ready, set the hosting environment's `NEXT_PUBLIC_AUTH_PROVIDERS` to the ready providers and rebuild with production approval. A local environment change does not enable production buttons.

No application production deployment or database migration was performed for this setup.
