import { WhiteboardCanvas } from "@/components/whiteboard/whiteboard-canvas";
import { getTranslations } from "next-intl/server";
import styles from "./whiteboard.module.css";

export default async function WhiteboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const t = await getTranslations("nav");

  return (
    <div className={styles.page}>
      <h1 className="sr-only">{t("whiteboard")}</h1>
      <div className={styles.canvasContainer}>
        <WhiteboardCanvas projectId={projectId} />
      </div>
    </div>
  );
}
