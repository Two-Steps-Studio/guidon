"use server";

import { revalidatePath } from "next/cache";
import { dataClient } from "@/lib/data-client";
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
  // Scoped by id AND user_id (not just id) - see CLAUDE.md's recurring bug
  // class note; RLS's own-row policy would block a mismatched id anyway, but
  // this keeps the intent explicit in the query itself.
  const { error } = await dataClient(user.id)
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
  const { error } = await dataClient(user.id)
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null };
}
