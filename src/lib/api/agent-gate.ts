import "server-only";

import { NextResponse } from "next/server";
import type { DataClient } from "@/lib/data-client";
import type { ApiKeyIdentity } from "./api-key-auth";
import { AGENT_GATE_ERRORS, agentDecision, type AgentPermission, type AgentPermissions } from "./agent-gate-core";

/**
 * 403 when the project's AI switch or the named AI permission rules this
 * agent key out, else null. Read under RLS as the key's owner, like the
 * route's own queries - see agent-gate-core.ts.
 */
export async function agentGate(
  db: DataClient,
  identity: Pick<ApiKeyIdentity, "humanClient">,
  projectId: string,
  permission: AgentPermission
): Promise<NextResponse | null> {
  if (identity.humanClient) return null;
  const [{ data: project }, { data: permissions }] = await Promise.all([
    db.from<{ ai_enabled: boolean }>("projects").select("ai_enabled").eq("id", projectId).maybeSingle(),
    db.from<Partial<AgentPermissions>>("project_ai_permissions").select(permission).eq("project_id", projectId).maybeSingle(),
  ]);
  const decision = agentDecision({
    humanClient: false,
    aiEnabled: project ? project.ai_enabled !== false : null,
    permissions,
    permission,
  });
  return decision === "allowed" ? null : NextResponse.json({ error: AGENT_GATE_ERRORS[decision](permission) }, { status: 403 });
}
