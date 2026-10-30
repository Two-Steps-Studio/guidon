import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api/api-route";
import { authorizeTaskAttachments, ATTACHMENT_METADATA_COLUMNS, type AttachmentMetadata } from "@/lib/api/task-attachments";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";

async function handleGET(request: NextRequest, { params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const { projectId, taskId } = await params;
  const access = await authorizeTaskAttachments(request, projectId, taskId);
  if (access.error) return access.error;
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (cursor && !isValidUuid(cursor)) return invalidIdResponse("cursor");
  const query = access.db.from<AttachmentMetadata>("task_attachments").select(ATTACHMENT_METADATA_COLUMNS).eq("task_id", taskId).order("id").limit(101);
  if (cursor) query.gt("id", cursor);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Could not load attachments." }, { status: 500 });
  const rows = data ?? [];
  return NextResponse.json({ attachments: rows.slice(0, 100), next_cursor: rows.length > 100 ? rows[99].id : null }, { headers: { "Cache-Control": "private, no-store" } });
}

export const GET = apiRoute(handleGET);
