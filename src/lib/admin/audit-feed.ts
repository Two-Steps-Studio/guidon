import "server-only";

import { serviceDataClient } from "@/lib/data-client";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole } from "@/lib/db/session";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { AUDIT_TARGETS, AUDIT_UUID } from "./audit";

export const AUDIT_ACTIONS = [...Object.keys(AUDIT_TARGETS).flatMap(action => [action, `${action}.requested`]), "users.pii.reveal"];
export const AUDIT_TARGET_TYPES = [...new Set([...Object.values(AUDIT_TARGETS), "user"])];
export const AUDIT_OUTCOMES = ["succeeded", "failed", "denied"] as const;

type SearchParams = Record<string, string | string[] | undefined>;
type AuditEvent = {
  id: string;
  created_at: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  outcome: typeof AUDIT_OUTCOMES[number];
  request_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
};

function dateFilter(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value) ? value : "";
}

export async function listAdminAudit(params: SearchParams) {
  await requireAdminAccess("audit.read");
  const field = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value.trim() : "";
  };
  const uuid = (key: string) => AUDIT_UUID.test(field(key)) ? field(key).toLowerCase() : "";
  const selected = (key: string, options: readonly string[]) => options.includes(field(key)) ? field(key) : "";
  const filters = {
    actor: uuid("actor"),
    request: uuid("request"),
    action: selected("action", AUDIT_ACTIONS),
    type: selected("type", AUDIT_TARGET_TYPES),
    target: field("target").slice(0, 200),
    outcome: selected("outcome", AUDIT_OUTCOMES),
    from: dateFilter(field("from")),
    through: dateFilter(field("through")),
  };
  const db = serviceDataClient();
  const table = "platform_admin_audit_events";
  const query = () => {
    const q = db.from<AuditEvent>(table)
      .select("id, created_at, actor_id, action, target_type, target_id, outcome, request_id, before_state, after_state")
      .order("created_at", { ascending: false }).order("id", { ascending: false });
    if (filters.actor) q.eq("actor_id", filters.actor);
    if (filters.request) q.eq("request_id", filters.request);
    if (filters.action) q.eq("action", filters.action);
    if (filters.type) q.eq("target_type", filters.type);
    if (filters.target) q.eq("target_id", filters.target);
    if (filters.outcome) q.eq("outcome", filters.outcome);
    if (filters.from) q.gte("created_at", `${filters.from}T00:00:00Z`);
    if (filters.through) q.lte("created_at", `${filters.through}T23:59:59.999999Z`);
    return q;
  };

  const cursor = uuid("cursor");
  let cursorTime: string | undefined;
  if (cursor) {
    // pg returns JS Dates by default. Preserve Postgres microseconds for keyset pagination.
    if (hasDirectDatabase()) {
      cursorTime = await withServiceRole(async ({ query }) => {
        const { rows } = await query("SELECT created_at::text FROM public.platform_admin_audit_events WHERE id = $1", [cursor]);
        return rows[0]?.created_at;
      });
    } else {
      const { data, error } = await db.from<Pick<AuditEvent, "created_at">>(table)
        .select("created_at").eq("id", cursor).maybeSingle();
      if (error) throw new Error("Could not load audit cursor");
      cursorTime = data?.created_at;
    }
  }
  const pageSize = 50;
  const rows: AuditEvent[] = [];
  if (cursorTime) {
    const tied = await query().eq("created_at", cursorTime).lt("id", cursor).limit(pageSize + 1);
    if (tied.error) throw new Error("Could not load audit events");
    rows.push(...tied.data);
  }
  if (rows.length <= pageSize) {
    const earlier = query().limit(pageSize + 1 - rows.length);
    if (cursorTime) earlier.lt("created_at", cursorTime);
    const { data, error } = await earlier;
    if (error) throw new Error("Could not load audit events");
    rows.push(...data);
  }
  const next = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  if (rows.length > pageSize) next.set("cursor", rows[pageSize - 1].id);
  return { filters, rows: rows.slice(0, pageSize), next: rows.length > pageSize ? next.toString() : null };
}
