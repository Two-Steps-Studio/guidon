import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { resolveBoardColumns, type BoardColumnOverride } from "@/lib/work/task-board";

/**
 * The project's board columns as the web board shows them - its saved
 * label/order/visibility overrides (migration 020) applied on top of
 * BOARD_COLUMNS by the same resolveBoardColumns the work page uses. Lets the
 * editor plugins render a project's customized board instead of the six
 * hard-coded defaults. Returns `{ columns: [{ status, label }] }` in board
 * order, hidden columns left out. Labels are the English defaults unless the
 * project saved its own (the API has no locale).
 *
 * `tasks:read`-gated like the tasks list; a project the key's user can't see
 * is 404, same as there.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");

  let overrides: BoardColumnOverride[];

  if (hasDirectDatabase()) {
    const projectExists = await withUser(guard.userId, ({ query }) =>
      query("SELECT 1 FROM projects WHERE id = $1", [projectId])
    );
    if (projectExists.rows.length === 0) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const result = await withUser(guard.userId, ({ query }) =>
      query<BoardColumnOverride>(
        "SELECT status, label, sort_order, hidden FROM project_board_columns WHERE project_id = $1",
        [projectId]
      )
    );
    overrides = result.rows;
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
      .from("project_board_columns")
      .select("status, label, sort_order, hidden")
      .eq("project_id", projectId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    overrides = (data ?? []) as BoardColumnOverride[];
  }

  const columns = resolveBoardColumns(overrides).map(({ status, label }) => ({ status, label }));
  return NextResponse.json({ columns });
}
