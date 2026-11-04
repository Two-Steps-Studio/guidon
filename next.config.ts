import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";
import path from "node:path";
import { contentSecurityPolicy } from "./src/lib/csp";
import { normalizeSiteUrl } from "./src/lib/oauth/oauth-core";

// One canonical address: www.<APP_URL host> answers 301 to APP_URL, path and query kept (SEO audit).
const SITE_ORIGIN = normalizeSiteUrl(process.env.APP_URL?.trim() || "https://useguidon.com");
const SITE_HOST = new URL(SITE_ORIGIN).hostname;

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");


function publicAvatarPatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (url.protocol !== "https:") return [];
    return [{ protocol: "https", hostname: url.hostname, port: url.port, pathname: "/storage/v1/object/public/avatars/**", search: "" }];
  } catch { return []; }
}

const nextConfig: NextConfig = {
  // "X-Powered-By: Next.js" only helps fingerprint the stack (ZAP, Seobility).
  poweredByHeader: false,
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

  async redirects() {
    if (SITE_HOST.startsWith("www.")) return [];
    return [{ source: "/:path*", has: [{ type: "host", value: `www.${SITE_HOST}` }], destination: `${SITE_ORIGIN}/:path*`, statusCode: 301 }];
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
          // Static files the proxy skips; pages get a per-request nonce policy from src/proxy.ts.
          { key: "Content-Security-Policy", value: contentSecurityPolicy({ isDev: process.env.NODE_ENV === "development", supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST }) },
          // Browser isolation (ZAP). Sign-in, Stripe and OAuth are redirects, and
          // the only window.open uses noopener, so no page needs its opener.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          // No Cross-Origin-Embedder-Policy: require-corp/credentialless would
          // block avatars and images from other origins (img-src https:), and
          // nothing here needs cross-origin isolation (no SharedArrayBuffer).
        ],
      },
      // API answers mostly carry one person's data; without this they go out
      // as `public, max-age=0` and a shared cache may keep a copy. This header
      // overrides the route's own, so the routes cached on purpose are left
      // out: the public MCP server cards and /api/storage (public images are
      // immutable; private files private, max-age=60). A new public route
      // missing here just loses caching, never leaks.
      {
        source: "/api/:path((?!storage|mcp/server-card|mcp/docs/server-card).*)",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      // Files other sites embed: the report widget script, brand assets and
      // icons. A later matching rule replaces the same header.
      ...["/widget/:path*", "/brand/:path*", "/assets/:path*", "/icons/:path*", "/downloads/:path*"].map((source) => ({
        source,
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }],
      })),
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
