"use server";

import { randomUUID } from "node:crypto";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { resolveAIProvider } from "@/lib/ai/resolve-provider";
import { reserveModuleBuilderAttempt } from "@/lib/ai/module-builder-rate-limit";
import { logActivity } from "@/lib/data/log-activity";
import { classifyBuilderFailure, compileModulePlan, requestModulePlan, type BuilderReply, type BuilderResult, type ModulePlan } from "@/lib/work/module-builder";
import type { ModuleManifest } from "@/lib/work/module-manifest";

export async function planProjectModule(projectId: string, prompt: unknown, previousPlan?: unknown): Promise<BuilderReply<ModulePlan>> {
  const requestId = randomUUID();
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) return { error: "permission", requestId };
  if (!access.project.ai_enabled) return { error: "aiDisabled", requestId };
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 6000) return { error: "invalidInput", requestId };
  const started = Date.now();
  let result: BuilderResult<ModulePlan>;
  if (!reserveModuleBuilderAttempt(access.userId, projectId, access.project.organization_id)) result = { error: "rateLimited" };
  else {
    try {
      const provider = await resolveAIProvider(access.project.organization_id, access.userId);
      result = provider ? await requestModulePlan(provider, prompt, previousPlan) : { error: "notConfigured" };
    } catch (error) { result = { error: classifyBuilderFailure(error) }; }
  }
  // No prompt, generated text, provider error bodies or credentials in logs.
  await logActivity({ userId: access.userId, projectId, action: "module_builder_attempt", entityType: "module_builder", details: { requestId, stage: "plan", outcome: result.error ?? "succeeded", durationMs: Date.now() - started } });
  return { ...result, requestId };
}

export async function compileProjectModule(projectId: string, plan: unknown, approved: unknown): Promise<BuilderReply<ModuleManifest>> {
  const requestId = randomUUID();
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) return { error: "permission", requestId };
  if (!access.project.ai_enabled) return { error: "aiDisabled", requestId };
  const result = compileModulePlan(plan, approved);
  await logActivity({ userId: access.userId, projectId, action: "module_builder_attempt", entityType: "module_builder", details: { requestId, stage: "compile", outcome: result.error ?? "succeeded" } });
  return { ...result, requestId };
}
