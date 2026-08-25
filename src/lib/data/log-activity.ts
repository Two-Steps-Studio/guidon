import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import type { ActivityAction } from "@/types/api";

interface LogActivityInput {
  userId: string;
  action: ActivityAction;
  /** Exactly one of projectId/organizationId should usually be set - activity_logs_insert (001) requires it. */
  projectId?: string | null;
  organizationId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Records one row to activity_logs for the project/organization Activity
 * page. Best-effort: a logging failure is swallowed (and reported to the
 * server console) rather than rolling back or failing the caller's actual
 * mutation, which has already committed by the time this runs - an audit
 * trail gap is far cheaper than losing a user's edit over a logging bug.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    if (hasDirectDatabase()) {
      await withUser(input.userId, ({ query }) =>
        query(
          `INSERT INTO activity_logs (project_id, organization_id, user_id, action, entity_type, entity_id, details)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            input.projectId ?? null,
            input.organizationId ?? null,
            input.userId,
            input.action,
            input.entityType ?? null,
            input.entityId ?? null,
            input.details ? JSON.stringify(input.details) : null,
          ]
        )
      );
      return;
    }

    const supabase = await createClient();
    await supabase.from("activity_logs").insert({
      project_id: input.projectId ?? null,
      organization_id: input.organizationId ?? null,
      user_id: input.userId,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      details: input.details ?? null,
    });
  } catch (error) {
    console.error(`logActivity(${input.action}) failed:`, error);
  }
}
