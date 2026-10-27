import "server-only";
import { NextResponse } from "next/server";
import type { ContextPackStats } from "@/lib/context/context-pack-core";

/**
 * The Markdown response for the context routes, with the pack's numbers in
 * X-Guidon-Context (JSON) so agents and tooling can see what was left out
 * without parsing the document. One log line per package served, ids and
 * counts only - never content (observability without copying project data
 * into logs).
 */
export function contextResponse(markdown: string, stats: ContextPackStats | undefined, log: { kind: "task" | "project"; projectId: string; taskId?: string; apiKeyId?: string }): NextResponse {
  const omitted = stats ? Object.values(stats.omitted).reduce((sum, ids) => sum + (ids?.length ?? 0), 0) : 0;
  const summary = stats ? { tokens: stats.estimatedTokens, budget: stats.budget, included: stats.included, omitted, redacted: stats.redacted, flagged: stats.flagged, stale: stats.stale } : null;
  console.info(JSON.stringify({ event: "context.served", ...log, ...summary }));
  return new NextResponse(markdown, {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8", ...(summary ? { "X-Guidon-Context": JSON.stringify(summary) } : {}) },
  });
}
