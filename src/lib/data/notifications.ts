import "server-only";

import { after } from "next/server";
import { dataClient, serviceDataClient } from "@/lib/data-client";

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
      const { error } = await serviceDataClient().from("notifications").insert({
        user_id: input.userId,
        project_id: input.projectId ?? null,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link,
      });
      if (error) throw new Error(error.message);
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
  const db = dataClient(userId);
  const [{ data: notifications }, { data: unreadCount }] = await Promise.all([
    db
      .from<Notification>("notifications")
      .select("id, project_id, type, title, body, link, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    db.from("notifications").eq("user_id", userId).is("read_at", null).count(),
  ]);
  return { notifications, unreadCount };
}
