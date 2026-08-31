import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");

  // Safety cap, not pagination - this endpoint has no cursor/page param yet;
  // matches the cap applied to the human-facing task board
  // (src/app/projects/[id]/work/page.tsx).
  const TASK_LIMIT = 1000;

  // A project the caller isn't a member of is invisible under RLS the same
  // way its tasks are - without checking this separately, "wrong/foreign
  // project id" and "a real, empty project" were both just `{ tasks: [] }`,
  // contradicting the documented contract (design doc: "a project they're
  // not a member of returns 404, not empty").
  if (hasDirectDatabase()) {
    const projectExists = await withUser(guard.userId, ({ query }) =>
      query("SELECT 1 FROM projects WHERE id = $1", [projectId])
    );
    if (projectExists.rows.length === 0) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const result = await withUser(guard.userId, ({ query }) =>
      query("SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2", [
        projectId,
        TASK_LIMIT,
      ])
    );
    return NextResponse.json({ tasks: result.rows });
  }

  const supabase = await getApiUserClient(guard.userId);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 400 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(TASK_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ tasks: data ?? [] });
}
