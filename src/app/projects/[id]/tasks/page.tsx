import { redirect } from "next/navigation";

/**
 * The task board moved to /projects/[id]/work as part of the Guidon
 * workspace navigation (Overview / Work / Roadmap / Knowledge / ...).
 *
 * This redirect keeps existing links and bookmarks working; the board
 * itself lives in ../work/page.tsx.
 */
export default async function ProjectTasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}/work`);
}
