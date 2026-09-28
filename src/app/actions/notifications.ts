"use server";

import { revalidatePath } from "next/cache";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/data/current-user";
import { listNotifications, type Notification } from "@/lib/data/notifications";

export async function getNotifications(): Promise<{
  notifications: Notification[];
  unreadCount: number;
}> {
  const user = await getCurrentUser();
  return listNotifications(user.id);
}

export async function markNotificationRead(notificationId: string): Promise<{ error: string | null }> {
  const user = await getCurrentUser();

  if (hasDirectDatabase()) {
    // Scoped by id AND user_id (not just id) - see CLAUDE.md's recurring
    // bug class note; RLS's own-row policy would block a mismatched id
    // anyway, but this keeps the intent explicit in the query itself.
    await withUser(user.id, ({ query }) =>
      query("UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL", [
        notificationId,
        user.id,
      ])
    );
    revalidatePath("/", "layout");
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null };
}

export async function markAllNotificationsRead(): Promise<{ error: string | null }> {
  const user = await getCurrentUser();

  if (hasDirectDatabase()) {
    await withUser(user.id, ({ query }) =>
      query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [user.id])
    );
    revalidatePath("/", "layout");
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null };
}
