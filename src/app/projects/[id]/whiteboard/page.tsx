import { WhiteboardCanvas } from "@/components/whiteboard/whiteboard-canvas";
import styles from "./whiteboard.module.css";

export default async function WhiteboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  return (
    <div className={styles.page}>
      <div className={styles.canvasContainer}>
        <WhiteboardCanvas projectId={projectId} />
      </div>
    </div>
  );
}
