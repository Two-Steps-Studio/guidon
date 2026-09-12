import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored monaco-editor assets (scripts/copy-monaco-assets.mjs) - minified
    // third-party code, not something this repo authors or should lint.
    "public/monaco-editor/**",
    // git worktrees (superpowers:using-git-worktrees) - each has its own
    // node_modules and build output; the patterns above are anchored to the
    // repo root and don't reach nested copies under here.
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
