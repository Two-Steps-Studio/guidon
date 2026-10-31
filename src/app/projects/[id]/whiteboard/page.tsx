import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { WhiteboardCanvas } from "@/components/whiteboard/whiteboard-canvas";
import { WhiteboardToolbar } from "@/components/whiteboard/whiteboard-toolbar";
import styles from "./whiteboard.module.css";

export default function WhiteboardPage() {
  const { id: projectId } = useParams();
  const t = useTranslations("nav");

  if (!projectId) return null;

  return (
    <div className={styles.page}>
      <div className={styles.canvasContainer}>
        <WhiteboardCanvas projectId={projectId as string} />
        <WhiteboardToolbar projectId={projectId as string} />
      </div>
    </div>
  );
}
