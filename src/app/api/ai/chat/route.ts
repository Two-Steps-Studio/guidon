import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/current-user";
import { aiOrchestrator } from "@/lib/ai/orchestrator";
import { getProjectAccess } from "@/lib/data/project-access";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, messages } = body;

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    // Verify project access before letting AI act on it
    const access = await getProjectAccess(projectId);
    if (!access) {
      return NextResponse.json({ error: "No access to project" }, { status: 403 });
    }

    const responseText = await aiOrchestrator.run(
      {
        projectId, // Passed to provide context if needed
        messages,
        system: `You are the Guidon AI Assistant for project ${access.project.name}.
        You have access to project data and tools via MCP.
        Be concise and helpful. Always verify the current project context before making changes.`,
      },
      user.id
    );

    return NextResponse.json({ text: responseText });
  } catch (error: any) {
    console.error("[AI Chat API Error]:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
