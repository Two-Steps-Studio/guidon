"use server";

import { createClient } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";

const MAX_MESSAGE_LENGTH = 4000;

export type SubmitFeedbackResult = { error: string | null };

/**
 * "Send feedback" in the profile menu (every page). No project/org scope -
 * this is feedback about Guidon itself, not something tied to a project, so
 * unlike almost every other Server Action here there is no canWriteProject-
 * style check: any signed-in user may send it, matching feedback_insert's
 * RLS (044) which only requires the row's user_id to be the caller.
 *
 * pageUrl is a client-supplied hint (window.location.pathname) for context,
 * not trusted for anything beyond display in the admin inbox - capped and
 * never interpolated into a query.
 */
export async function submitFeedback(message: string, pageUrl: string | null): Promise<SubmitFeedbackResult> {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return { error: "Feedback can't be empty." };
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { error: `Feedback is limited to ${MAX_MESSAGE_LENGTH} characters.` };
  }

  const user = await getCurrentUser();
  const trimmedPageUrl = pageUrl?.trim().slice(0, 2000) || null;

  if (hasDirectDatabase()) {
    try {
      await withUser(user.id, ({ query }) =>
        query("INSERT INTO feedback (user_id, message, page_url) VALUES ($1, $2, $3)", [
          user.id,
          trimmed,
          trimmedPageUrl,
        ])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to send feedback." };
    }
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .insert({ user_id: user.id, message: trimmed, page_url: trimmedPageUrl });

  if (error) return { error: error.message };
  return { error: null };
}
