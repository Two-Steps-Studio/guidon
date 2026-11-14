# Guidon Cloud on Cloudflare Workers

How to run the hosted product (Supabase as database, auth and file storage)
on Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare).
Self-hosting with your own PostgreSQL does not run here (no TCP database
driver, no local disk): use [self-hosting.md](./self-hosting.md) for that.

## Cost and limits (measured)

- The worker is **6.8 MiB gzipped**. The free plan allows 3 MiB, so Guidon
  needs **Workers Paid (5 USD a month)**, whose limit is 10 MiB. The free
  plan's 10 ms of CPU per request would not be enough for server rendering
  either.
- Workers Paid includes 10 million requests and 30 million CPU-milliseconds a
  month; static files are served free and don't count.

## Build, preview, deploy

```bash
npm run cf:build      # OpenNext build into .open-next/
npm run cf:preview    # build + run locally in workerd (wrangler dev)
npm run cf:deploy     # wrangler deploy (needs `wrangler login` first)
```

`NEXT_PUBLIC_*` values are compiled into the client bundle, so they must be in
the environment (or `.env.production.local`) when `cf:build` runs:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_APP_URL`, and the optional `NEXT_PUBLIC_AUTH_PROVIDERS`,
`NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_*`.

Server-side values are Worker secrets, one `wrangler secret put <NAME>` each:
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `AUTH_SECRET` (the same
value as before - it decrypts secrets already stored in the database),
`APP_URL`, `CRON_SECRET` (any long random text), `ADMIN_EMAILS`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and the GitHub, Discord, AI, Stripe and
Sentry keys you use. For local preview put them in `.dev.vars` (gitignored).

Then add the domain in the Cloudflare dashboard (Workers > guidon > Settings >
Domains & Routes > Custom domain).

## What is different from Vercel

- `deploy/cloudflare-worker.ts` is the entry point: the OpenNext worker plus a
  `scheduled` handler for the two daily jobs (`wrangler.jsonc` `triggers`).
- `src/proxy.ts` runs as OpenNext's Node.js middleware, which OpenNext marks
  **experimental** on Cloudflare.
- `sharp` (native) does not run on Workers. Attachment compression and cover
  thumbnails already fall back to the original file when it fails.
- The in-memory rate limits are per isolate, so they are looser than on one
  server.
- `next/image` optimisation is served by the worker; add an Images binding in
  `wrangler.jsonc` if you want Cloudflare Images to do it.

## Checked and not checked

Checked locally in workerd: the build, public pages, Markdown routes, the
proxy's redirect to sign-in, discovery documents, `/_next/image`, the cron
routes' authentication and the `scheduled` handler. Not checked (needs a real
Supabase project and a Cloudflare account): sign-in, database reads and
writes, uploads, MCP with a real token, Stripe and GitHub webhooks.
