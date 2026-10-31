# PostHog Data Warehouse Setup Report

Created 0 of 5 detected sources in PostHog. The user cancelled two consecutive credential prompts, so all 5 need browser setup.

## Project changes

- No application code or configuration was changed.
- Created this report: `posthog-warehouse-report.md`.

## Sources created

None.

## Manual setup required

Open each link and complete authentication in PostHog:

- [Connect Expo](https://eu.i.posthog.com/project/328724/data-warehouse/new-source?kind=Expo&utm_source=wizard&utm_campaign=warehouse-source)
- [Connect Sentry](https://eu.i.posthog.com/project/328724/data-warehouse/new-source?kind=Sentry&utm_source=wizard&utm_campaign=warehouse-source)
- [Connect Stripe](https://eu.i.posthog.com/project/328724/data-warehouse/new-source?kind=Stripe&utm_source=wizard&utm_campaign=warehouse-source)
- [Connect Supabase](https://eu.i.posthog.com/project/328724/data-warehouse/new-source?kind=Supabase&utm_source=wizard&utm_campaign=warehouse-source)
- [Connect Vercel](https://eu.i.posthog.com/project/328724/data-warehouse/new-source?kind=Vercel&utm_source=wizard&utm_campaign=warehouse-source)

For Stripe, use a restricted `rk_live_…` key with the required read scopes and webhook write permission if real-time synchronization is desired. For Sentry, use an internal-integration token rather than a DSN. For Supabase, use the database password and Session pooler connection details rather than an anon or service-role key.
