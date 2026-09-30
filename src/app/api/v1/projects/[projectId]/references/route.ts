import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { getSignedUrl } from "@/lib/storage/storage";
import { STORAGE_BUCKETS } from "@/lib/storage/storage-constants";

const LIMIT = 500;
const COLUMNS = "id, name, storage_path, size_bytes, mime_type, caption, tags, source_url, created_at";

interface Row {
  id: string;
  name: string;
  storage_path: string;
  size_bytes: number | null;
  mime_type: string;
  caption: string | null;
  tags: string[] | null;
  source_url: string | null;
  created_at: string;
}

/**
 * The project's moodboard (project_references, migration 048), newest
 * first, for the editor plugins. Each entry carries `image_url`, a
 * short-lived signed URL to download the image itself - fetch it right away
 * rather than storing it.
 *
 * `tasks:read`-gated like the columns route: read-only project content that
 * every plugin key already has. A project the key's user can't see is 404.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");

  let rows: Row[];

  if (hasDirectDatabase()) {
    const result = await withUser(guard.userId, async ({ query }) => {
      const project = await query("SELECT 1 FROM projects WHERE id = $1", [projectId]);
      if (project.rows.length === 0) return null;
      return query<Row>(
        `SELECT ${COLUMNS} FROM project_references WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [projectId, LIMIT]
      );
    });
    if (!result) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    rows = result.rows;
  } else {
    const supabase = await getApiUserClient(guard.userId);
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 400 });
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

    const { data, error } = await supabase
      .from("project_references")
      .select(COLUMNS)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    rows = (data ?? []) as Row[];
  }

  const references = await Promise.all(
    rows.map(async ({ storage_path, tags, ...rest }) => {
      let imageUrl: string | null = null;
      try {
        imageUrl = await getSignedUrl(STORAGE_BUCKETS.FILES, storage_path);
      } catch {
        imageUrl = null;
      }
      return { ...rest, tags: tags ?? [], image_url: imageUrl };
    })
  );

  return NextResponse.json({ references });
}
