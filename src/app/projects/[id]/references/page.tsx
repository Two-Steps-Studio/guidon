import { getTranslations } from "next-intl/server";
import { canCommentOnProject, canManageProject, requireProjectAccess } from "@/lib/data/project-access";
import { loadReferences } from "./actions";
import { MoodboardBoard } from "./moodboard-board";

export default async function ProjectReferencesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const t = await getTranslations("moodboard");
  const access = await requireProjectAccess(projectId);
  const { references, error } = await loadReferences(projectId);

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <MoodboardBoard
        projectId={projectId}
        initialReferences={references}
        loadError={error}
        currentUserId={access.userId}
        canUpload={canCommentOnProject(access.role)}
        canManage={canManageProject(access.role)}
        title={t("title")}
        subtitle={t("subtitle")}
      />
    </div>
  );
}
