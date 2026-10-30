import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api/api-route";
import { authorizeTaskAttachments, ATTACHMENT_METADATA_COLUMNS, type AttachmentMetadata } from "@/lib/api/task-attachments";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { getStorageProvider, assertSafeStoragePath } from "@/lib/storage/provider";
import { STORAGE_BUCKETS } from "@/lib/storage/storage-constants";
import { MAX_INLINE_ATTACHMENT_BYTES, attachmentImageMime } from "@/lib/mcp/http/attachment-content";

async function handleGET(request: NextRequest, { params }: { params: Promise<{ projectId: string; taskId: string; attachmentId: string }> }) {
  const { projectId, taskId, attachmentId } = await params;
  const access = await authorizeTaskAttachments(request, projectId, taskId);
  if (access.error) return access.error;
  if (!isValidUuid(attachmentId)) return invalidIdResponse("attachmentId");
  const { data: attachment, error } = await access.db.from<AttachmentMetadata & { storage_path: string }>("task_attachments").select(`${ATTACHMENT_METADATA_COLUMNS}, storage_path`).eq("id", attachmentId).eq("task_id", taskId).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load attachment." }, { status: 500 });
  if (!attachment) return NextResponse.json({ error: "Attachment not found in this task." }, { status: 404 });
  try {
    const safePath = assertSafeStoragePath(attachment.storage_path);
    if (!safePath.startsWith(`projects/${projectId}/tasks/${taskId}/`)) return NextResponse.json({ error: "Attachment path does not match this task." }, { status: 404 });
    const provider = await getStorageProvider();
    const metadata: AttachmentMetadata = { id: attachment.id, task_id: attachment.task_id, name: attachment.name, size_bytes: attachment.size_bytes, mime_type: attachment.mime_type, created_at: attachment.created_at };
    const download = async (reason?: string) => NextResponse.json({ attachment: metadata, download_url: await provider.getUrl(STORAGE_BUCKETS.ATTACHMENTS, safePath, { expiresInSeconds: 600 }), expires_in_seconds: 600, ...(reason ? { inline_unavailable: reason } : {}) }, { headers: { "Cache-Control": "private, no-store" } });
    if (request.nextUrl.searchParams.get("mode") === "download") return await download();
    if ((attachment.size_bytes ?? 0) > MAX_INLINE_ATTACHMENT_BYTES) return await download("File exceeds the 2 MiB inline limit.");
    const blob = await provider.download(STORAGE_BUCKETS.ATTACHMENTS, safePath);
    if (blob.size > MAX_INLINE_ATTACHMENT_BYTES) return await download("File exceeds the 2 MiB inline limit.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mime = attachmentImageMime(bytes) ?? (/^(text\/(plain|markdown|csv)|application\/(pdf|json|zip))$/i.test(attachment.mime_type ?? "") ? attachment.mime_type! : "application/octet-stream");
    return new Response(bytes, { headers: { "Content-Type": mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name).replace(/'/g, "%27")}`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not read attachment. Please try again." }, { status: 502 });
  }
}

export const GET = apiRoute(handleGET);
