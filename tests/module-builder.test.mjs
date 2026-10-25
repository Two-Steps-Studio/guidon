import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (context.parentURL?.includes('/src/lib/work/') && /^\.\\/module-[a-z-]+$/.test(specifier)) return next(specifier + '.ts', context);
  return next(specifier, context);
}`)}`, import.meta.url);
const { requestModulePlan, compileModulePlan, parseModulePlan } = await import("../src/lib/work/module-builder.ts");
const manifest = JSON.parse(await readFile(new URL("../examples/module-manifests/release-planning.json", import.meta.url), "utf8"));
const plan = { id: manifest.id, name: manifest.name, summary: "Track releases", questions: [], entities: manifest.entities, views: manifest.views, permissions: manifest.permissions, relations: [] };
let calls = [];
const mock = (text, extra = {}) => ({ complete: async (input) => { calls.push(input); return { text, ...extra }; } });

const proposed = await requestModulePlan(mock(JSON.stringify(plan)), "Plan releases");
assert.equal(proposed.error, null);
assert.equal(calls.length, 1);
assert.deepEqual(calls[0].messages, [{ role: "user", content: "Plan releases" }]);
assert.equal(calls[0].tools, undefined);
assert.equal(calls[0].maxTokens, 6000);
assert.match(calls[0].system, /relations must be empty/);
assert.equal(compileModulePlan(proposed.value, false).error, "approvalRequired");
assert.equal(compileModulePlan({ ...proposed.value, questions: ["Which statuses?"] }, true).error, "needsAnswers");
const compiled = compileModulePlan(proposed.value, true);
assert.equal(compiled.error, null);
assert.deepEqual(compiled.value.entities, proposed.value.entities);
assert.deepEqual(compiled.value.views, proposed.value.views);
assert.deepEqual(compiled.value.permissions, proposed.value.permissions);
assert.equal(compiled.value.lifecycle.uninstall, "retain_data");
assert.equal(calls.length, 1, "approval compiles deterministically without another billed call");
assert.equal((await requestModulePlan(mock('```json\n' + JSON.stringify(plan) + '\n```'), "plan")).error, null);
console.log("pass mock LLM plan, explicit approval and deterministic validated compilation");
const revised = {...plan,name:"Manual edit retained"};
assert.equal((await requestModulePlan(mock(JSON.stringify(revised)),"Keep my manual fields",revised)).error,null);
assert.match(calls.at(-1).messages[0].content,/Manual edit retained/);
assert.equal(calls.at(-1).messages[1].content,"Keep my manual fields");
const callCount=calls.length;
assert.equal((await requestModulePlan(mock(JSON.stringify(plan)),"Refine",{...plan,script:"execute"})).error,"invalidInput");
assert.equal(calls.length,callCount,"Invalid existing plans cannot invoke the provider");

for (const [name, invalid] of [
  ["script", { ...plan, script: "globalThis.pwned = true" }],
  ["dependency", { ...plan, dependencies: ["evil"] }],
  ["unknown scope", { ...plan, permissions: ["tasks:write"] }],
  ["missing read", { ...plan, permissions: ["module-data:write"] }],
  ["form without write", { ...plan, permissions: ["module-data:read"] }],
  ["relation", { ...plan, relations: [{ source: "release", target: "task" }] }],
  ["invalid view", { ...plan, views: [{ ...plan.views[0], entity: "missing" }] }],
]) {
  assert.throws(() => parseModulePlan(invalid), name);
  assert.equal((await requestModulePlan(mock(JSON.stringify(invalid)), "plan")).error, "invalidResponse", name);
  assert.equal(compileModulePlan(invalid, true).error, "invalidInput", name);
}
for (const response of ["not JSON", JSON.stringify([plan]), "<script>globalThis.pwned=true</script>", "a".repeat(128001)]) {
  assert.equal((await requestModulePlan(mock(response), "plan")).error, "invalidResponse");
}
assert.equal((await requestModulePlan(mock(JSON.stringify(plan), { tool_calls: [{ name: "execute" }] }), "plan")).error, "invalidResponse");
assert.equal((await requestModulePlan(mock(JSON.stringify(plan), { stop_reason: "max_tokens" }), "plan")).error, "invalidResponse");
assert.equal(globalThis.pwned, undefined);
console.log("pass malformed, executable, unsupported, truncated and tool-call output is rejected");

calls = [];
for (const prompt of [null, {}, "", "  ", "a".repeat(6001)]) assert.equal((await requestModulePlan(mock("{}"), prompt)).error, "invalidInput");
assert.equal(calls.length, 0);
for (const [error, expected] of [
  [new Error("openai request failed: 429 API_KEY_SECRET"), "rateLimited"],
  [Object.assign(new Error("secret"), { name: "TimeoutError" }), "timeout"],
  [Object.assign(new Error("secret"), { name: "AbortError" }), "timeout"],
  [new Error("custom request failed: 503 sensitive body"), "providerFailed"],
  [new Error("ANTHROPIC_API_KEY secret missing"), "providerFailed"],
]) {
  const result = await requestModulePlan({ complete: async () => { throw error; } }, "plan");
  assert.deepEqual(result, { error: expected });
  assert.doesNotMatch(JSON.stringify(result), /SECRET|sensitive|ANTHROPIC/);
}
console.log("pass invalid inputs never call LLM; 429, timeout and provider failures return safe error codes");

// Exercise the real server actions and limiter with fixtures only at the
// authentication, provider and audit storage boundaries. No DB/key/network.
const sourceRoot = new URL("../src/", import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`
const sources = {
  '@/lib/data/project-access': 'export const getProjectAccess = async () => globalThis.__builderFixture.access; export const canManageProject = role => ["owner","admin"].includes(role);',
  '@/lib/ai/resolve-provider': 'export const resolveAIProvider = async () => { globalThis.__builderFixture.resolved++; return globalThis.__builderFixture.provider; };',
  '@/lib/data/log-activity': 'export const logActivity = async input => { globalThis.__builderFixture.logs.push(input); };',
  'server-only': 'export {};'
};
export async function resolve(specifier, context, next) {
  if (sources[specifier]) return { url: 'data:text/javascript,' + encodeURIComponent(sources[specifier]), shortCircuit: true };
  if (specifier.startsWith('@/lib/')) return next(${JSON.stringify(sourceRoot)} + specifier.slice(2) + '.ts', context);
  if (context.parentURL?.includes('/src/lib/ai/') && specifier.startsWith('./') && !specifier.endsWith('.ts')) return next(specifier + '.ts', context);
  return next(specifier, context);
}`)}`, import.meta.url);
const { planProjectModule, compileProjectModule } = await import("../src/app/projects/[id]/modules/builder-actions.ts");
globalThis.__builderFixture = { access: null, provider: mock(JSON.stringify(plan)), resolved: 0, logs: [] };
const fixture = globalThis.__builderFixture;
assert.equal((await planProjectModule("p", "plan")).error, "permission");
fixture.access = { userId: "user-a", role: "developer", project: { ai_enabled: true, organization_id: "org-a" } };
assert.equal((await planProjectModule("p", "plan")).error, "permission");
fixture.access.role = "admin"; fixture.access.project.ai_enabled = false;
assert.equal((await planProjectModule("p", "plan")).error, "aiDisabled");
assert.equal((await compileProjectModule("p", plan, true)).error, "aiDisabled");
fixture.access.project.ai_enabled = true;
assert.equal((await planProjectModule("p", " ")).error, "invalidInput");
assert.equal(fixture.resolved, 0, "denied/disabled/invalid attempts must not resolve credentials or call AI");
for (let i = 0; i < 8; i++) assert.equal((await planProjectModule("p", "plan")).error, null);
assert.equal((await planProjectModule("p", "plan")).error, "rateLimited");
assert.equal(fixture.resolved, 8);
assert.equal(fixture.logs.length, 9);
assert.equal(fixture.logs.at(-1).details.outcome, "rateLimited");
assert.equal((await compileProjectModule("p", plan, false)).error, "approvalRequired");
assert.equal((await compileProjectModule("p", plan, true)).error, null);
assert.equal(fixture.resolved, 8, "manifest compilation has no provider side effect");
assert.equal(fixture.logs.at(-1).details.stage, "compile");
assert.doesNotMatch(JSON.stringify(fixture.logs), /Track releases|API_KEY|messages|prompt/);
assert.match(fixture.logs[0].details.requestId, /^[a-f0-9-]{36}$/);
for (let i = 0; i < 32; i++) {
  fixture.access.userId = `user-${i}`;
  assert.equal((await planProjectModule(`p-${i}`, "plan")).error, null);
}
fixture.access.userId = "last-user";
assert.equal((await planProjectModule("last-project", "plan")).error, "rateLimited");
fixture.access.project.organization_id = "org-not-configured"; fixture.provider = null;
assert.equal((await planProjectModule("p", "plan")).error, "notConfigured");
fixture.provider = { complete: async () => { throw new Error("openai request failed: 429 API_KEY_SECRET"); } };
assert.equal((await planProjectModule("p", "plan")).error, "rateLimited");
assert.doesNotMatch(JSON.stringify(fixture.logs), /API_KEY_SECRET/);
delete globalThis.__builderFixture;
console.log("pass actual server actions gate roles/AI/input, enforce user and org budgets, and emit redacted audit outcomes");
