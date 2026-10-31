import { useTranslations } from "next-intl";
import { WhiteboardCanvas } from "@/components/whiteboard/whiteboard-canvas";
import { WhiteboardToolbar } from "@/components/whiteboard/whiteboard-toolbar";
import styles from "./whiteboard.module.css";

export default async function WhiteboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const t = useTranslations("nav");

  if (!projectId) return null;

  return (
    <div className={styles.page}>
      <div className={styles.canvasContainer}>
        <WhiteboardCanvas projectId={projectId} />
        <WhiteboardToolbar projectId={projectId} />
      </div>
    </div>
  );
}
