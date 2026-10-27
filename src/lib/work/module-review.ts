import type { ModuleManifest } from "./module-manifest";
import { validateModulePreview } from "./module-preview";

/**
 * What the registry checks before a version is published, and what it shows
 * a moderator next to a public submission. `blocking` findings stop the
 * submission; `warnings` are for the human reviewer - a module's text can
 * be read by people and by AI agents (task context, MCP), so links, markup
 * and instructions aimed at a model get a second look.
 */
export const MODULE_LICENSES = [
  "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0", "GPL-3.0-only",
  "LGPL-3.0-only", "AGPL-3.0-only", "CC-BY-4.0", "CC0-1.0", "Unlicense", "Proprietary",
] as const;
export type ModuleLicense = (typeof MODULE_LICENSES)[number];

export type ReviewFinding = { code: "schema" | "permissions" | "engine" | "read" | "write" | "entities" | "views" | "link" | "markup" | "instructions" | "writeAccess" | "noViews"; path: string; excerpt?: string };

const LINK = /\bhttps?:\/\/[^\s"'<>]+/i;
const MARKUP = /<\s*(script|iframe|object|embed|img|svg|style|link|meta|form)\b|javascript:|data:text\/html|on[a-z]+\s*=/i;
const INSTRUCTIONS = /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|system)\b[^.\n]{0,20}\b(instructions?|prompts?|rules?|messages?)\b|\bsystem prompt\b|\byou are now\b|\bact as (an?|the)\b|\bnew instructions\b|<\|?(system|im_start|im_end)\|?>|\bdo not tell the user\b|\bexfiltrat/i;

/** Every human-readable string of a manifest, with its path. */
export function manifestTexts(manifest: ModuleManifest): { path: string; text: string }[] {
  const texts = [{ path: "name", text: manifest.name }, { path: "author.name", text: manifest.author.name }];
  if (manifest.description) texts.push({ path: "description", text: manifest.description });
  manifest.entities.forEach((entity, e) => {
    texts.push({ path: `entities.${e}.name`, text: entity.name });
    entity.fields.forEach((field, f) => {
      texts.push({ path: `entities.${e}.fields.${f}.name`, text: field.name });
      if (field.type === "select") field.options.forEach((option, o) => texts.push({ path: `entities.${e}.fields.${f}.options.${o}`, text: option.label }));
    });
  });
  manifest.views.forEach((view, v) => {
    texts.push({ path: `views.${v}.name`, text: view.name });
    if (view.type === "page") view.blocks.forEach((block, b) => {
      texts.push({ path: `views.${v}.blocks.${b}.title`, text: block.title });
      if (block.type === "text") texts.push({ path: `views.${v}.blocks.${b}.text`, text: block.text });
    });
  });
  return texts;
}

function excerpt(text: string, match: RegExpExecArray): string {
  const start = Math.max(0, match.index - 30);
  return `${start ? "…" : ""}${text.slice(start, match.index + match[0].length + 30)}${match.index + match[0].length + 30 < text.length ? "…" : ""}`;
}

export function reviewModuleSubmission(input: unknown, listing: { description: string; changelog: string; demoTexts?: string[] }): { manifest: ModuleManifest | null; blocking: ReviewFinding[]; warnings: ReviewFinding[] } {
  const preview = validateModulePreview(input);
  const blocking: ReviewFinding[] = preview.issues.filter((issue) => issue.code !== "entities").map((issue) => ({ code: issue.code, path: issue.path }));
  if (!preview.manifest) return { manifest: null, blocking, warnings: [] };
  const manifest = preview.manifest;
  if (!manifest.views.length) blocking.push({ code: "noViews", path: "views" });
  const warnings: ReviewFinding[] = [];
  const texts = [...manifestTexts(manifest), { path: "listing.description", text: listing.description }, { path: "listing.changelog", text: listing.changelog },
    ...(listing.demoTexts ?? []).map((text, index) => ({ path: `demo.${index}`, text }))];
  for (const { path, text } of texts) {
    for (const [code, pattern] of [["instructions", INSTRUCTIONS], ["markup", MARKUP], ["link", LINK]] as const) {
      const match = pattern.exec(text);
      if (match) warnings.push({ code, path, excerpt: excerpt(text, match) });
    }
  }
  if (manifest.permissions.includes("module-data:write")) warnings.push({ code: "writeAccess", path: "permissions" });
  return { manifest, blocking, warnings };
}
