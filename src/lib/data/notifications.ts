import "server-only";

import { after } from "next/server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole, withUser } from "@/lib/db/session";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export type NotificationType = "task_assigned";

export interface Notification {
  id: string;
  project_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string;
  read_at: string | null;
  created_at: string;
}

interface CreateNotificationInput {
  userId: string;
  projectId?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  link: string;
}

/**
 * Inserts one notification for `userId` (almost always a *different* user
 * than whoever triggered it - e.g. whoever assigned them a task). Migration
 * 045 deliberately gives `authenticated` no INSERT policy at all for this
 * table (the RLS shape "insert your own row" doesn't apply when the actor
 * and the recipient are different people), so this always runs with
 * elevated privilege from an already-permission-checked Server Action -
 * never reachable directly from a request.
 *
 * Best-effort and deferred via next/server's `after()`, same reasoning as
 * logActivity (src/lib/data/log-activity.ts): a notification failing to
 * write must never roll back or delay the mutation that triggered it.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  after(async () => {
    try {
      if (hasDirectDatabase()) {
        await withServiceRole(({ query }) =>
          query(
            `INSERT INTO notifications (user_id, project_id, type, title, body, link)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [input.userId, input.projectId ?? null, input.type, input.title, input.body ?? null, input.link]
          )
        );
        return;
      }

      const supabase = createServiceClient();
      await supabase.from("notifications").insert({
        user_id: input.userId,
        project_id: input.projectId ?? null,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link,
      });
    } catch (error) {
      console.error(`createNotification(${input.type}) failed:`, error);
    }
  });
}

const RECENT_LIMIT = 20;

/**
 * The caller's own notifications, newest first - unlike createNotification,
 * this runs as the signed-in user (RLS's own-row SELECT policy is exactly
 * what scopes it), not with elevated privilege.
 */
export async function listNotifications(
  userId: string
): Promise<{ notifications: Notification[]; unreadCount: number }> {
  if (hasDirectDatabase()) {
    return withUser(userId, async ({ query }) => {
      const { rows } = await query<Notification>(
        `SELECT id, project_id, type, title, body, link, read_at, created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, RECENT_LIMIT]
      );
      const { rows: unread } = await query<{ n: number }>(
        "SELECT count(*)::int n FROM notifications WHERE user_id = $1 AND read_at IS NULL",
        [userId]
      );
      return { notifications: rows, unreadCount: unread[0]?.n ?? 0 };
    });
  }

  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, project_id, type, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  return { notifications: (data as Notification[]) ?? [], unreadCount: count ?? 0 };
}
