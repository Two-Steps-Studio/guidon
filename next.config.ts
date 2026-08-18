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
   * server actually imports. Required by the Dockerfile — see docs/self-hosting.md.
   */
  output: "standalone",
};

export default nextConfig;
