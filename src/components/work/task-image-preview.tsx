"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getTaskAttachmentDownloadUrl,
  loadTaskAttachments,
  type TaskAttachment,
} from "@/app/projects/[id]/work/attachments-actions";

type ImageAttachment = TaskAttachment & { url: string };

/**
 * Inline thumbnail strip for image-type attachments, shown right under the
 * description - separate from TaskAttachmentsSection's full file list
 * further down, which shows every attachment (including images) as a
 * generic named row rather than a visible preview. Renders nothing while
 * loading and nothing on error/empty, since this is a supplementary visual
 * enhancement, not a primary action - TaskAttachmentsSection already owns
 * the upload/delete/error UI for the underlying data.
 */
export function TaskImagePreview({ projectId, taskId }: { projectId: string; taskId: string }) {
  const t = useTranslations("work");
  const [images, setImages] = useState<ImageAttachment[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await loadTaskAttachments(projectId, taskId);
      if (cancelled || result.error) return;

      const imageAttachments = result.attachments.filter((a) => a.mime_type?.startsWith("image/"));
      if (imageAttachments.length === 0) return;

      const withUrls = await Promise.all(
        imageAttachments.map(async (attachment) => {
          const urlResult = await getTaskAttachmentDownloadUrl(projectId, taskId, attachment.id);
          return urlResult.url ? { ...attachment, url: urlResult.url } : null;
        })
      );

      if (!cancelled) {
        setImages(withUrls.filter((a): a is ImageAttachment => a !== null));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, taskId]);

  if (images.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">{t("images")}</h3>
      <div className="flex gap-2 overflow-x-auto">
        {images.map((image) => (
          <a
            key={image.id}
            href={image.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 overflow-hidden rounded-md border border-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed, per-attachment URLs from any storage provider (local or Supabase), not a static/optimizable asset */}
            <img src={image.url} alt={image.name} className="h-24 w-24 object-cover" />
          </a>
        ))}
      </div>
    </div>
  );
}
