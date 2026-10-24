"use server";

import { createClient } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { tr } from "@/lib/i18n/server-errors";
import { FEEDBACK_MAX_LENGTH, isFeedbackRating } from "@/lib/feedback";


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
export async function submitFeedback(message: string, pageUrl: string | null, rating: number | null = null): Promise<SubmitFeedbackResult> {
  if (typeof message !== "string") return { error: await tr("Feedback can't be empty.") };
  if (rating !== null && !isFeedbackRating(rating)) return { error: await tr("Choose a rating from 1 to 5.") };
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return { error: await tr("Feedback can't be empty.") };
  }
  if (trimmed.length > FEEDBACK_MAX_LENGTH) {
    return { error: `Feedback is limited to ${FEEDBACK_MAX_LENGTH} characters.` };
  }

  const user = await getCurrentUser();
  const trimmedPageUrl = typeof pageUrl === "string" ? pageUrl.trim().slice(0, 2000) || null : null;

  if (hasDirectDatabase()) {
    try {
      await withUser(user.id, ({ query }) =>
        query("INSERT INTO feedback (user_id, message, page_url, rating) VALUES ($1, $2, $3, $4)", [
          user.id,
          trimmed,
          trimmedPageUrl,
          rating,
        ])
      );
    } catch {
      return { error: await tr("Failed to send feedback.") };
    }
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .insert({ user_id: user.id, message: trimmed, page_url: trimmedPageUrl, rating });

  if (error) return { error: await tr("Failed to send feedback.") };
  return { error: null };
}
