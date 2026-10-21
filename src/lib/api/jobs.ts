import "server-only";

import { serviceDataClient } from "@/lib/data-client";
import { SITE_URL } from "@/lib/site-url";

/**
 * Long-running API work (migration 075): created as `queued`, answered with
 * 202 Accepted + Location, worked on after the response (next/server
 * after()), polled at GET /api/v1/jobs/{id}. Service role - the owner check
 * is done here on every read.
 */

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface JobRow {
  id: string;
  user_id: string;
  kind: string;
  status: JobStatus;
  total: number;
  done: number;
  result: unknown;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export function jobUrl(id: string): string {
  return `${SITE_URL}/api/v1/jobs/${id}`;
}

/** The public shape of a job. */
export function presentJob(job: JobRow) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    progress: { done: job.done, total: job.total },
    result: job.result ?? null,
    error: job.error,
    created_at: job.created_at,
    updated_at: job.updated_at,
    status_url: jobUrl(job.id),
  };
}

export async function createJob(userId: string, kind: string, total: number): Promise<JobRow> {
  const { data, error } = await serviceDataClient()
    .from<JobRow>("api_jobs")
    .insert({ user_id: userId, kind, total })
    .select("*")
    .single();
  if (error || !data) throw new Error(`Could not create the job: ${error?.message}`);
  return data;
}

export async function updateJob(id: string, patch: Partial<Pick<JobRow, "status" | "done" | "result" | "error">>): Promise<void> {
  await serviceDataClient()
    .from("api_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/** The job, only if it belongs to `userId`. */
export async function getJob(userId: string, id: string): Promise<JobRow | null> {
  const { data } = await serviceDataClient().from<JobRow>("api_jobs").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return data ?? null;
}
