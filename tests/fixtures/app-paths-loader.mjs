// Node's type stripping does not resolve TypeScript's @/* path aliases.
// Keep production imports intact while running the public-doc generators.
export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}
