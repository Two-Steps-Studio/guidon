import type { ReactNode } from "react";
import messages from "../../messages/en.json";
import example from "../../examples/module-manifests/release-planning.json";
import { compileModulePlan } from "../../src/lib/work/module-builder";

export default function Link({ href, children, ...props }: { href: string; children: ReactNode }) { return <a href={href} {...props}>{children}</a>; }
export function useRouter() { return { refresh() {} }; }
export function useTranslations(namespace: string) {
  return (key: string, values: Record<string,unknown> = {}) => {
    const group = (messages as unknown as Record<string,Record<string,string>>)[namespace];
    let value = group?.[key];
    if (!value) throw new Error(`Missing translation ${namespace}.${key}`);
    for (const [name,replacement] of Object.entries(values)) value = value.replaceAll(`{${name}}`,String(replacement));
    return value;
  };
}
export async function planProjectModule() {
  return { error: null, requestId: "fixture-plan", value: { id:example.id,name:example.name,summary:"Fixture plan",questions:[],entities:example.entities,views:example.views,permissions:example.permissions,relations:[] } };
}
export async function compileProjectModule(_project: string, plan: unknown, approved: boolean) { return { ...compileModulePlan(plan,approved), requestId:"fixture-compile" }; }
export async function createModulePackage() { return { error:null }; }
export async function saveProjectModuleDraft(_project: string, state: unknown, revision: number) {
  return (await fetch("/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({state,revision})})).json();
}
