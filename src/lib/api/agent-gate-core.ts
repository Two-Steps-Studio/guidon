/**
 * The project's "AI Permissions" switches (project_ai_permissions, migration
 * 016; Settings -> AI Permissions) as one decision, so every /api/v1 route an
 * agent can call applies the switch the settings page shows for it.
 *
 * Applies to agent keys only: a human-operated client (api_keys.human_client,
 * migration 039 - the Unity plugin) is a person who can do the same in the
 * browser. RLS (the key owner's project role) stays the real boundary for
 * every key; this is the project admins' consent on top of it. Pure - tested
 * by tests/api-route.test.mjs.
 */

export const AGENT_PERMISSIONS = [
  "can_read_context",
  "can_create_comments",
  "can_change_status",
  "can_complete_tasks",
  "can_modify_settings",
  "can_delete_tasks",
] as const;
export type AgentPermission = (typeof AGENT_PERMISSIONS)[number];
export type AgentPermissions = Record<AgentPermission, boolean>;

/** A project with no row yet behaves like the migration's column defaults. */
export const AGENT_PERMISSION_DEFAULTS: AgentPermissions = {
  can_read_context: true,
  can_create_comments: true,
  can_change_status: true,
  can_complete_tasks: false,
  can_modify_settings: false,
  can_delete_tasks: false,
};

export type AgentDecision = "allowed" | "ai_disabled" | "not_permitted";

export function agentDecision(input: {
  humanClient: boolean;
  /** projects.ai_enabled (046); null when the project row couldn't be read - RLS answers that case. */
  aiEnabled: boolean | null;
  permissions: Partial<AgentPermissions> | null;
  permission: AgentPermission;
}): AgentDecision {
  if (input.humanClient) return "allowed";
  if (input.aiEnabled === false) return "ai_disabled";
  const value = input.permissions?.[input.permission];
  return (typeof value === "boolean" ? value : AGENT_PERMISSION_DEFAULTS[input.permission]) ? "allowed" : "not_permitted";
}

export const AGENT_GATE_ERRORS: Record<Exclude<AgentDecision, "allowed">, (permission: AgentPermission) => string> = {
  ai_disabled: () => "AI features are turned off for this project. Ask a project admin to enable them in Settings.",
  not_permitted: (permission) =>
    `This project's AI permissions don't allow this (${permission}). A project admin can change it in Settings -> AI Permissions.` +
    (permission === "can_delete_tasks"
      ? ' Or ask a person to approve it: POST /api/v1/tasks/{id}/approval-requests {"action":"delete_task"} (MCP: request_approval).'
      : ""),
};
