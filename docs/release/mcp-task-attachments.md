# Task attachments over MCP and REST

The task's working context now includes attachment metadata and a tool reference. No attachment is sent to an external AI provider automatically.

## MCP

1. `list_task_attachments({project_id, task_id})` returns up to 100 files with IDs, names, MIME types and sizes. Pass `next_cursor` as `cursor` until null.
2. `get_task_attachment({project_id, task_id, attachment_id})` returns raster images as native MCP image content. UTF-8 plain text, Markdown, CSV and JSON are embedded text resources; other files are embedded binary resources.
3. Files over **2 MiB** return JSON containing `download_url` and `expires_in_seconds: 600`. `mode: "download"` requests a download link for any file. The limit leaves room for base64 and protocol overhead inside the production response limit.

PNG/JPEG/GIF/WebP signatures are inspected instead of trusting the stored MIME label. SVG/HTML are not rendered as active image content. File contents remain untrusted data and must not override user or system instructions.

## REST

- `GET /api/v1/projects/{projectId}/tasks/{taskId}/attachments?cursor={next_cursor}`
- `GET /api/v1/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}`
- Add `?mode=download` for temporary download metadata.

Both routes require `tasks:read`. Existing key expiry, revocation, origin restrictions, rate limiting, project binding, RLS and the agent's `can_read_context` gate apply. Project/task/attachment IDs must match; the storage path must belong to that exact task. Storage remains private. Responses are `private, no-store`; bytes have attachment disposition and `nosniff`.

Download URLs are bearer capabilities: anyone holding one can use it until expiration, even if an integration is revoked in the meantime. Do not publish or log them. Revocation blocks new API/MCP reads and creation of further links. Existing links have at most ten minutes remaining.

## Rollout and client discovery

No database migration, new bucket or OAuth scope is needed. Deploy the approved application commit through the existing Vercel process. Existing credentials do not need rotation. MCP clients may need to refresh tool discovery or reconnect the transport to see the two new tools; a plugin with a saved/static tool catalog may require catalog refresh. Do not delete OAuth grants or ask for extra permissions to refresh a catalog.

After deployment, verify `tools/list` contains both tools, read an actual task context, list its attachments, and open an image and a document in the intended client. Current local tests cover real REST/MCP dispatch against isolated PostgreSQL/private local storage; the hosted Supabase storage path and installed plugin still need a post-deployment check.
