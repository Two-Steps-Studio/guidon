"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/data/current-user";
import { dataClient } from "@/lib/data-client";
import { isValidUuid } from "@/lib/api/validate-id";
import { MAX_PINNED_PROJECTS, getPinnedProjectIds } from "@/lib/data/pinned-projects";

export type PinResult = { pinned: string[]; error: "too_many" | "failed" | null };

/** Pins or unpins one project for the signed-in person (migration 065). */
export async function setProjectPinned(projectId: string, pin: boolean): Promise<PinResult> {
  const user = await getCurrentUser();
  if (!isValidUuid(projectId)) return { pinned: [], error: "failed" };
  const db = dataClient(user.id);
  const current = await getPinnedProjectIds(user.id);

  if (pin) {
    if (current.includes(projectId)) return { pinned: current, error: null };
    // Only a project the person can actually see (RLS) gets pinned.
    const { data: project } = await db.from<{ id: string }>("projects").select("id").eq("id", projectId).maybeSingle();
    if (!project) return { pinned: current, error: "failed" };
  }

  // Ids of projects that are gone or no longer visible don't count against the limit.
  let next = pin ? [...current, projectId] : current.filter((id) => id !== projectId);
  if (next.length > MAX_PINNED_PROJECTS) {
    const { data: visible } = await db.from<{ id: string }>("projects").select("id").in("id", next);
    const visibleIds = new Set(visible.map((row) => row.id));
    next = next.filter((id) => visibleIds.has(id));
    if (next.length > MAX_PINNED_PROJECTS) return { pinned: current, error: "too_many" };
  }

  const { data, error } = await db
    .from("profiles")
    .update({ pinned_project_ids: next })
    .eq("id", user.id)
    .select<{ id: string }>("id");
  if (error || !data.length) return { pinned: current, error: "failed" };

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { pinned: next, error: null };
}
