import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");

  if (hasDirectDatabase()) {
    const result = await withUser(guard.userId, ({ query }) =>
      query("SELECT * FROM tasks WHERE id = $1", [taskId])
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }
    return NextResponse.json({ task: result.rows[0] });
  }

  const supabase = await getApiUserClient(guard.userId);
  const { data, error } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ task: data });
}
