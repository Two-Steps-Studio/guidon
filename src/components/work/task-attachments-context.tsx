"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  deleteTaskAttachment,
  getTaskAttachmentDownloadUrl,
  getTaskAttachmentImageUrls,
  loadTaskAttachments,
  uploadTaskAttachment,
  type TaskAttachment,
} from "@/app/projects/[id]/work/attachments-actions";

/**
 * One task's attachments, shared by everything in the task dialog that
 * shows them: the file list (TaskAttachmentsSection), the image gallery
 * (TaskImageGallery), and inline `attachment:<id>` images in the
 * description and comments. Before this each of those loaded the same list
 * on its own, so an image pasted into the description didn't show up in
 * the gallery or file list until the dialog was reopened.
 */
interface TaskAttachmentsValue {
  attachments: TaskAttachment[];
  loading: boolean;
  error: string | null;
  /** Signed URL per image attachment id; missing while loading or if signing failed. */
  imageUrls: Record<string, string>;
  upload: (file: File) => Promise<{ attachment: TaskAttachment | null; error: string | null }>;
  remove: (attachmentId: string) => Promise<{ error: string | null }>;
  downloadUrl: (attachmentId: string) => Promise<{ url: string | null; error: string | null }>;
}

const TaskAttachmentsContext = createContext<TaskAttachmentsValue | null>(null);

export function TaskAttachmentsProvider({
  projectId,
  taskId,
  children,
}: {
  projectId: string;
  taskId: string;
  children: ReactNode;
}) {
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [list, urls] = await Promise.all([
        loadTaskAttachments(projectId, taskId),
        getTaskAttachmentImageUrls(projectId, taskId),
      ]);
      if (cancelled) return;
      if (list.error) setError(list.error);
      else setAttachments(list.attachments);
      setImageUrls(urls.urls);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, taskId]);

  const upload = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadTaskAttachment(projectId, taskId, formData);
      const attachment = result.attachment;
      if (result.error || !attachment) return { attachment: null, error: result.error ?? "Upload failed." };

      setAttachments((current) => [attachment, ...current]);
      if (attachment.mime_type?.startsWith("image/")) {
        const signed = await getTaskAttachmentDownloadUrl(projectId, taskId, attachment.id);
        const url = signed.url;
        if (url) setImageUrls((current) => ({ ...current, [attachment.id]: url }));
      }
      return { attachment, error: null };
    },
    [projectId, taskId]
  );

  const remove = useCallback(
    async (attachmentId: string) => {
      const result = await deleteTaskAttachment(projectId, taskId, attachmentId);
      if (result.error) return { error: result.error };
      setAttachments((current) => current.filter((a) => a.id !== attachmentId));
      setImageUrls((current) => {
        const next = { ...current };
        delete next[attachmentId];
        return next;
      });
      return { error: null };
    },
    [projectId, taskId]
  );

  const downloadUrl = useCallback(
    (attachmentId: string) => getTaskAttachmentDownloadUrl(projectId, taskId, attachmentId),
    [projectId, taskId]
  );

  const value = useMemo(
    () => ({ attachments, loading, error, imageUrls, upload, remove, downloadUrl }),
    [attachments, loading, error, imageUrls, upload, remove, downloadUrl]
  );

  return <TaskAttachmentsContext.Provider value={value}>{children}</TaskAttachmentsContext.Provider>;
}

export function useTaskAttachments(): TaskAttachmentsValue {
  const value = useContext(TaskAttachmentsContext);
  if (!value) throw new Error("useTaskAttachments must be used inside <TaskAttachmentsProvider>");
  return value;
}

/** `![alt](attachment:<uuid>)` - how a pasted/dropped image is referenced from markdown. */
export const ATTACHMENT_URL_PREFIX = "attachment:";

export function attachmentImageMarkdown(name: string, attachmentId: string): string {
  // Brackets in a file name would end the alt text early.
  const alt = name.replace(/[[\]]/g, "");
  return `![${alt}](${ATTACHMENT_URL_PREFIX}${attachmentId})`;
}
