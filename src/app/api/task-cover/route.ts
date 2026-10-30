import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/auth-helpers";
import { dataClient } from "@/lib/data-client";
import { assertSafeStoragePath } from "@/lib/storage/provider";
import { isValidUuid } from "@/lib/api/validate-id";
import { readCoverPreview } from "@/lib/storage/cover-preview";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const error = (status: number) => NextResponse.json({ error: "Cover unavailable" }, { status, headers });

/** Session-only previews. Never put private attachments in Next's public image cache. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return error(auth.status);
  let storagePath: string;
  try { storagePath = assertSafeStoragePath(request.nextUrl.searchParams.get("path") ?? ""); }
  catch { return error(400); }
  const [, projectId, taskId] = /^projects\/([^/]+)\/tasks\/([^/]+)\//.exec(storagePath) ?? [];
  if (!isValidUuid(projectId ?? "") || !isValidUuid(taskId ?? "")) return error(400);
  const db = dataClient(auth.userId);
  const task = await db.from<{ id: string }>("tasks").select("id").eq("id", taskId).eq("project_id", projectId).maybeSingle();
  if (task.error || !task.data) return error(404);
  const attachment = await db.from<{ id: string }>("task_attachments").select("id").eq("task_id", taskId).eq("storage_path", storagePath).maybeSingle();
  if (attachment.error || !attachment.data) return error(404);
  try {
    const bytes = await readCoverPreview(storagePath);
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/webp", "Content-Disposition": 'inline; filename="cover.webp"' } });
  } catch { return error(404); }
}
