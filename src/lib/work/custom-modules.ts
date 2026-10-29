import { z } from "zod";

const text = z.string().trim().min(1).max(4000);
const label = z.string().trim().min(1).max(100);
const safeUrl = z.string().url().max(2000).refine((value) => {
  try { return ["https:", "http:"].includes(new URL(value).protocol); }
  catch { return false; }
}, "Use an HTTP or HTTPS URL");

export const customModuleSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  title: label,
  description: z.string().trim().max(500).default(""),
  /** Sidebar group the module is listed under; none = the shared "Custom modules" group. */
  category: z.string().trim().min(1).max(40).optional(),
  blocks: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), title: label, text }),
    z.object({ type: z.literal("checklist"), title: label, items: z.array(z.object({ label, done: z.boolean() })).min(1).max(30) }),
    z.object({ type: z.literal("links"), title: label, items: z.array(z.object({ label, url: safeUrl })).min(1).max(30) }),
  ])).min(1).max(20),
});

export const customModulesSchema = z.array(customModuleSchema).max(20).superRefine((modules, ctx) => {
  if (new Set(modules.map((module) => module.id)).size !== modules.length) {
    ctx.addIssue({ code: "custom", message: "Module IDs must be unique" });
  }
  if (JSON.stringify(modules).length > 64000) {
    ctx.addIssue({ code: "custom", message: "Modules exceed the 64,000 character limit" });
  }
});

export type CustomModule = z.infer<typeof customModuleSchema>;

export const CUSTOM_MODULE_PRESETS: CustomModule[] = [
  { version: 1, id: "release", title: "Release checklist", description: "Prepare and verify a release.", blocks: [
    { type: "checklist", title: "Release gates", items: [{ label: "Tests pass", done: false }, { label: "Release notes reviewed", done: false }, { label: "Rollback plan ready", done: false }] },
    { type: "text", title: "Release notes", text: "Describe the changes and the rollout plan." },
  ] },
  { version: 1, id: "research", title: "Research hub", description: "Collect questions, evidence and useful links.", blocks: [
    { type: "text", title: "Research question", text: "What do we need to learn?" },
    { type: "checklist", title: "Evidence", items: [{ label: "Interview users", done: false }, { label: "Record findings", done: false }] },
    { type: "links", title: "Resources", items: [{ label: "Guidon documentation", url: "https://useguidon.com/developers" }] },
  ] },
];

export const CUSTOM_MODULE_AI_PROMPT = `Create a Guidon custom project module. Return only JSON, no code fences.
Use this exact shape: {"version":1,"id":"my-module","title":"Title","description":"Purpose","blocks":[{"type":"text","title":"Notes","text":"Content"},{"type":"checklist","title":"Steps","items":[{"label":"First step","done":false}]},{"type":"links","title":"Resources","items":[{"label":"Website","url":"https://example.com"}]}]}.
IDs: lowercase letter then lowercase letters, digits or hyphens, at most 64 characters. Titles and item labels: 1-100 characters. Description: at most 500. Text: 1-4000. Use 1-20 blocks, 1-30 items per list. Links must use HTTP or HTTPS. No HTML, JavaScript, embedded frames or executable code. Customize the content for the user's requested workflow. Preserve the schema and version.`;
