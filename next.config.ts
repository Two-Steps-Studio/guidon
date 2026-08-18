import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },

  /**
   * Emit a self-contained server bundle in .next/standalone.
   *
   * Without this the Docker image has to carry the whole node_modules tree
   * (~500MB for this project); with it the runtime stage copies only what the
   * server actually imports. Required by the Dockerfile — see docs/self-hosting-audit.md.
   */
  output: "standalone",

  experimental: {
    serverActions: {
      // File uploads now go through a Server Action (src/app/projects/[id]/files/actions.ts)
      // instead of the browser talking to storage directly, so this has to
      // clear getFileSizeLimit()'s ceiling — FILE_SIZE_LIMITS.DOCUMENT, 25MB —
      // not just Next's 1MB default. Rounded up for multipart overhead.
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
