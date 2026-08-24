import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { projectId } = await params;

  if (hasDirectDatabase()) {
    const result = await withUser(guard.userId, ({ query }) =>
      query("SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at DESC", [projectId])
    );
    return NextResponse.json({ tasks: result.rows });
  }

  const supabase = await getApiUserClient(guard.userId);
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ tasks: data ?? [] });
}
