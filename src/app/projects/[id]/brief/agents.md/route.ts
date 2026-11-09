import { NextResponse } from "next/server";
import { getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { buildAgentsMd } from "@/lib/data/agents-md";
import { isValidUuid } from "@/lib/api/validate-id";

/** The signed-in member's download of the project's AGENTS.md (the API key route is /api/v1/projects/{id}/agents.md). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  if (!isValidUuid(projectId)) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const access = await getProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const markdown = await buildAgentsMd(dataClient(access.userId), projectId);
  if (!markdown) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return new NextResponse(markdown, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'attachment; filename="AGENTS.md"', "Cache-Control": "private, no-store" },
  });
}
