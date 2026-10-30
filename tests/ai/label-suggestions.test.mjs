import assert from "node:assert/strict";
import { register } from "node:module";

const root = new URL("../../src/", import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`
const stubs = {
  'server-only': 'export {};',
  '@/lib/data/project-access': 'export const getProjectAccess=async()=>globalThis.__labelFixture.access;export const canManageProject=role=>["owner","admin"].includes(role);',
  '@/lib/data/ai-preference': 'export const showAi=async(id,enabled)=>enabled&&!globalThis.__labelFixture.hidden;',
  '@/lib/ai/resolve-provider': 'export const resolveAIProvider=async()=>{globalThis.__labelFixture.resolved++;return globalThis.__labelFixture.provider;};',
  '@/lib/ai/chat-rate-limit': 'export const isChatRateLimited=()=>globalThis.__labelFixture.limited;export const recordChatMessage=()=>{};',
  '@/lib/data/project-language': 'export const getProjectLanguage=async()=>"en";',
  '@/lib/i18n/server-errors': 'export const tr=async text=>text;',
  '@/lib/data-client': 'export const dataClient=userId=>({from:table=>{const call={userId,table};globalThis.__labelFixture.queries.push(call);const q={select:columns=>{call.columns=columns;return q},eq:(column,value)=>{call[column]=value;return q},order:()=>q,limit:limit=>{call.limit=limit;return Promise.resolve({data:table==="tasks"?[{title:"Ship login"}]:[{name:"Bug"}],error:null})}};return q}});'
};
export async function resolve(specifier,context,next){
  if(stubs[specifier])return {url:'data:text/javascript,'+encodeURIComponent(stubs[specifier]),shortCircuit:true};
  if(specifier.startsWith('@/'))return next(${JSON.stringify(root)}+specifier.slice(2)+'.ts',context);
  if(context.parentURL?.includes('/src/lib/')&&/^\\.\\.?\\//.test(specifier)&&!specifier.endsWith('.ts'))return next(specifier+'.ts',context);
  return next(specifier,context);
}`)}`, import.meta.url);

const { parseLabelSuggestions } = await import("../../src/lib/ai/label-suggestions.ts");
assert.deepEqual(parseLabelSuggestions("not JSON", ["bug"]), []);
const parsed = parseLabelSuggestions(JSON.stringify([{ name: " Bug " }, { name: "Feature", color: "bad" }, { name: "feature" }, null, { name: "a,b" }, { name: "x".repeat(50) }]), ["bug"]);
assert.equal(parsed.length, 1);
assert.equal(parsed[0].name, "Feature");
assert.match(parsed[0].color, /^#[0-9a-f]{6}$/);
assert.equal(parseLabelSuggestions(JSON.stringify(Array.from({length:100},(_,i)=>({name:`Label ${i}`}))), []).length, 10);
assert.deepEqual(parseLabelSuggestions('{"labels":[]}', []), []);
assert.equal(parseLabelSuggestions('```json\n[{"name":"Audio","color":"#ff0000"}]\n```', []).length, 1);

const { suggestProjectLabels } = await import("../../src/app/projects/[id]/settings/label-ai-actions.ts");
globalThis.__labelFixture = { access: null, resolved: 0, queries: [], hidden: false, limited: false, provider: { complete: async input => { globalThis.__labelFixture.input = input; return { text: '[{"name":"Audio","color":"#ff0000"}]' }; } } };
const f = globalThis.__labelFixture;
assert.ok((await suggestProjectLabels("p")).error);
f.access = { userId: "u", role: "developer", project: { name:"P",description:"D",ai_enabled:true,organization_id:"o" } };
assert.ok((await suggestProjectLabels("p")).error);
f.access.role = "owner";f.hidden = true;
assert.ok((await suggestProjectLabels("p")).error);
f.hidden = false;f.access.project.ai_enabled = false;
assert.ok((await suggestProjectLabels("p")).error);
f.access.project.ai_enabled = true;f.limited = true;
assert.ok((await suggestProjectLabels("p")).error);
assert.equal(f.resolved, 0, "Denied, disabled, hidden and rate-limited requests never resolve AI credentials");
f.limited = false;
assert.equal((await suggestProjectLabels("p")).suggestions[0].name, "Audio");
assert.ok(f.queries.every(q => q.userId === "u" && q.project_id === "p"));
assert.equal(f.queries.find(q=>q.table==="tasks").limit,20);
assert.equal(f.input.tools, undefined, "Suggestions cannot execute writes");
assert.equal(f.input.maxTokens,800);
f.provider = { complete: async()=>{ throw new Error("API_KEY_SECRET provider response"); } };
assert.doesNotMatch(JSON.stringify(await suggestProjectLabels("p")),/SECRET|response/);
delete globalThis.__labelFixture;
console.log("pass label parsing, deduplication, bounds, role/AI/rate gates, scoped context and safe failures");
