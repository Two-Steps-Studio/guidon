import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },

  /**
   * Emit a self-contained server bundle in .next/standalone — but only for
   * the Docker build.
   *
   * Without this the Docker image has to carry the whole node_modules tree
   * (~500MB for this project); with it the runtime stage copies only what the
   * server actually imports. Required by the Dockerfile — see docs/self-hosting-audit.md.
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
      // clear getFileSizeLimit()'s ceiling — FILE_SIZE_LIMITS.DOCUMENT, 25MB —
      // not just Next's 1MB default. Rounded up for multipart overhead.
      bodySizeLimit: "30mb",
    },
  },

  // Baseline security headers - applied here rather than in src/proxy.ts so
  // they're attached to every response (including ones the middleware
  // matcher skips, e.g. static assets) without an extra header-copy step in
  // the proxy. Deliberately does NOT include Content-Security-Policy: this
  // app loads Monaco's editor worker, next/font files, inline JSON-LD
  // structured data (src/app/page.tsx), and (self-hosted) an
  // admin-configurable storage/API origin, and a wrong CSP silently breaks
  // features instead of failing a build - that needs deliberate, tested
  // rollout rather than a blind default here.
  async headers() {
    return [
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
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
