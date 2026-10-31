import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";
import path from "node:path";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Content-Security-Policy, scoped to what this app actually loads (audited,
 * not a blind default - a wrong CSP silently breaks features instead of
 * failing a build):
 * - script-src/style-src need 'unsafe-inline': Radix UI (this app's dialog/
 *   dropdown/popover primitives) sets inline `style=""` attributes for
 *   positioning, and Next injects inline hydration scripts. A nonce-based
 *   policy would need every page forced into dynamic rendering (killing
 *   static optimization for the public marketing/auth pages) - not worth it
 *   for this app's threat model, which is dominated by third-party-origin
 *   loading, not same-origin inline content.
 * - img-src/media-src/frame-src allow the Supabase origin: browser-side
 *   Supabase Auth (login/signup/logout/reset-password/OAuth,
 *   src/lib/supabase.ts's createBrowserClient) calls it directly, and
 *   file-viewer.tsx previews attachments (img/video/audio/iframe for PDF)
 *   straight from a signed storage URL, which is same-origin in self-hosted
 *   `local` mode but the Supabase storage origin in hosted mode.
 * - img-src also allows any https origin: OAuth (Google/Discord) avatar URLs
 *   come from whichever provider the user signed in with, not one fixed
 *   domain.
 * - worker-src allows blob: for Monaco's editor workers (otherwise served
 *   same-origin from public/monaco-editor/vs, see scripts/copy-monaco-assets.mjs).
 * - No `upgrade-insecure-requests`: would force HTTPS on every subresource,
 *   breaking self-hosted deployments that intentionally run over plain HTTP
 *   behind their own reverse proxy (same reasoning as the HSTS header below).
 * - Inline JSON-LD (src/app/page.tsx, type="application/ld+json") is exempt
 *   from script-src by spec - browsers never treat it as executable script.
 * - script-src/connect-src allow Google Analytics's origins: layout.tsx
 *   renders `@next/third-parties/google`'s <GoogleAnalytics> when
 *   `!hasDirectDatabase()` (hosted mode only) - included unconditionally
 *   here since next.config.ts's headers() is static per build, not
 *   per-request, and an unused allowlist entry on self-hosted builds is
 *   harmless. connect-src needs the `*.google-analytics.com` wildcard, not
 *   just `www.google-analytics.com` - GA4 sends collect requests to a
 *   region-specific subdomain (observed: region1.google-analytics.com),
 *   confirmed by an actual CSP-violation console error during verification,
 *   not just Google's docs.
 */
function buildContentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV === "development";

  let supabaseOrigin = "";
  try {
    supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : "";
  } catch {
    supabaseOrigin = "";
  }

  let posthogOrigin = "";
  let posthogAssetsOrigin = "";
  try {
    const posthogUrl = new URL(process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "");
    posthogOrigin = posthogUrl.origin;
    posthogAssetsOrigin = `${posthogUrl.protocol}//${posthogUrl.hostname.replace(".i.", "-assets.i.")}`;
  } catch {
    // PostHog is optional, so leave its CSP sources out until configured.
  }

  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com${posthogAssetsOrigin ? ` ${posthogAssetsOrigin}` : ""}${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://*.google-analytics.com${supabaseOrigin ? ` ${supabaseOrigin}` : ""}${posthogOrigin ? ` ${posthogOrigin}` : ""}`,
    `media-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    `frame-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ];

  return directives.join("; ");
}

function publicAvatarPatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (url.protocol !== "https:") return [];
    return [{ protocol: "https", hostname: url.hostname, port: url.port, pathname: "/storage/v1/object/public/avatars/**", search: "" }];
  } catch { return []; }
}

const nextConfig: NextConfig = {
  images: { remotePatterns: publicAvatarPatterns() },
  // Local storage is mutable runtime data, never a server build input. Newer
  // filesystem tracing can otherwise include the whole repo through its root.
  outputFileTracingExcludes: {
    "/*": [
      "./.env*", "./**/.env*", "./.git/**/*", "./.worktrees/**/*",
      "./storage/**/*", "./output/**/*", "./tests/**/*", "./docs/**/*",
      "./desktop/**/*", "./mobile/**/*", "./discord-bot/**/*",
      "./plugins/**/*", "./agent-plugin/**/*", "./graphify-out/**/*",
      "./skills/**/*", "./.agents/**/*", "./.claude/**/*",
      ...(() => {
        const relative = path.relative(__dirname, path.resolve(process.env.STORAGE_PATH ?? "./storage")).replaceAll("\\", "/");
        if (!relative) throw new Error("STORAGE_PATH must not be the repository root");
        // Paths outside the build root cannot be bundled from this repository.
        if (relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) return [];
        // Escape glob metacharacters in an operator-supplied directory name.
        return [`./${relative.replace(/[\\*?\[\]{}()!+@]/g, "\\$&")}/**/*`];
      })(),
    ],
  },
  // This fork's Turbopack DEV server silently fails to resolve next-intl's
  // dynamic message import (src/i18n/load-messages.ts's
  // `import(`../../messages/${locale}.json`)`) - "Module not found: Can't
  // resolve '../../messages'" at dev time only. `next build`/`next start`
  // (production, also Turbopack via this same `turbopack` block) and
  // `next dev --webpack` both resolve it correctly, so package.json's `dev`
  // script runs webpack for local dev only; production is unaffected.
  turbopack: {
    root: __dirname,
  },

  /**
   * Emit a self-contained server bundle in .next/standalone - but only for
   * the Docker build.
   *
   * Without this the Docker image has to carry the whole node_modules tree
   * (~500MB for this project); with it the runtime stage copies only what the
   * server actually imports. Required by the Dockerfile - see docs/self-hosting-audit.md.
   *
   * Unconditional `output: "standalone"` broke the separate Vercel deployment
   * of this same app: Vercel has its own equivalent bundling built into the
   * platform and does not expect `standalone` output. The build itself
   * succeeded (Next.js compiled, typechecked, and generated all pages) but
   * Vercel's own post-build step then failed looking for
   * `.next/next-server.js.nft.json`, which `standalone` mode does not leave
   * in the place Vercel's pipeline expects. `VERCEL` is set to `"1"` by
   * Vercel's build environment automatically (never set locally or in the
   * Dockerfile), so this makes the two deployment targets share one config
   * without either needing to know about the other.
   */
  output: process.env.VERCEL ? undefined : "standalone",

  experimental: {
    serverActions: {
      // File uploads now go through a Server Action (src/app/projects/[id]/files/actions.ts)
      // instead of the browser talking to storage directly, so this has to
      // clear getFileSizeLimit()'s ceiling - FILE_SIZE_LIMITS.DOCUMENT, 25MB -
      // not just Next's 1MB default. Rounded up for multipart overhead.
      bodySizeLimit: "30mb",
    },
  },

  // Baseline security headers - applied here rather than in src/proxy.ts so
  // they're attached to every response (including ones the middleware
  // matcher skips, e.g. static assets) without an extra header-copy step in
  // the proxy.
  async headers() {
    return [
      // RFC 8288 Link header on the homepage: where agents find the sitemap,
      // the Markdown twin, the API description and the API catalog without
      // parsing HTML.
      {
        source: "/",
        headers: [
          {
            key: "Link",
            value: [
              '</sitemap.xml>; rel="sitemap"',
              '</index.md>; rel="alternate"; type="text/markdown"',
              '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
              '</developers>; rel="service-doc"',
              '</.well-known/api-catalog>; rel="api-catalog"',
              '</.well-known/ard.json>; rel="ard"; type="application/ai-catalog+json"',
              '</llms.txt>; rel="describedby"; type="text/plain"',
            ].join(", "),
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // Browsers ignore this over a plain-HTTP connection, so it's safe
          // to send unconditionally for the self-hosted (possibly TLS-less,
          // behind the user's own reverse proxy) deployment too.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
        ],
      },
    ];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  // Silences the "no auth token, skipping source map upload" notice on
  // every build for the overwhelming majority of installs (self-hosted,
  // or a hosted instance that hasn't opted into Sentry) that never set
  // SENTRY_AUTH_TOKEN. org/project/authToken all fall back to the
  // standard SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN env vars on their
  // own when set - nothing to wire through here.
  silent: true,
});
