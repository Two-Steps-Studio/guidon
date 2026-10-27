// src/lib/work (and billing *-core) modules import their siblings without an extension, as the
// app's bundler expects. Node's type stripping needs the .ts: `--import` this
// file before a test that loads such a module directly.
import { register } from "node:module";

register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (context.parentURL?.includes('/src/lib/work/') && /^\\.\\/(module|custom)-[a-z-]+$/.test(specifier)) return next(specifier + '.ts', context);
  if (context.parentURL?.includes('/src/lib/billing/') && /^\\.\\/[a-z-]+-core$/.test(specifier)) return next(specifier + '.ts', context);
  return next(specifier, context);
}`)}`, import.meta.url);
