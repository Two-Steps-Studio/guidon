"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, FileText, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteTaskAttachment,
  getTaskAttachmentDownloadUrl,
  loadTaskAttachments,
  uploadTaskAttachment,
  type TaskAttachment,
} from "@/app/projects/[id]/work/attachments-actions";

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Self-contained, same shape as TaskAttemptsSection: loads its own data on
 * mount, owns its own upload/delete state, doesn't touch the parent
 * dialog's form state.
 */
export function TaskAttachmentsSection({
  projectId,
  taskId,
  canUpload,
  currentUserId,
  canManageProject,
}: {
  projectId: string;
  taskId: string;
  canUpload: boolean;
  currentUserId: string | null;
  /** Owner/admin can delete any attachment; anyone can delete their own (task_attachments_delete's actual RLS boundary - this only controls the button, RLS still re-checks server-side). */
  canManageProject: boolean;
}) {
  const t = useTranslations("work");
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Thumbnail for each image-type attachment, keyed by id - fetched
  // separately from the list itself since a signed download URL isn't part
  // of loadTaskAttachments' own row (same reasoning as TaskImagePreview's
  // own fetch). fetchedImageIds tracks what's already been requested so a
  // re-render (e.g. after a delete elsewhere) doesn't re-fetch every image
  // again.
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const fetchedImageIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      const result = await loadTaskAttachments(projectId, taskId);
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setAttachments(result.attachments);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, taskId]);

  useEffect(() => {
    const toFetch = attachments.filter(
      (attachment) => attachment.mime_type?.startsWith("image/") && !fetchedImageIds.current.has(attachment.id)
    );
    if (toFetch.length === 0) return;
    for (const attachment of toFetch) fetchedImageIds.current.add(attachment.id);

    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        toFetch.map(async (attachment) => {
          const result = await getTaskAttachmentDownloadUrl(projectId, taskId, attachment.id);
          return result.url ? ([attachment.id, result.url] as const) : null;
        })
      );
      if (cancelled) return;
      setImageUrls((current) => {
        const next = { ...current };
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [attachments, projectId, taskId]);

  const handleFileChosen = async (file: File) => {
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadTaskAttachment(projectId, taskId, formData);
      if (result.error || !result.attachment) throw new Error(result.error ?? t("failedToUploadAttachment"));

      setAttachments((current) => [result.attachment as TaskAttachment, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToUploadAttachment"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (attachmentId: string) => {
    setDeletingId(attachmentId);
    setError(null);

    try {
      const result = await deleteTaskAttachment(projectId, taskId, attachmentId);
      if (result.error) throw new Error(result.error);

      setAttachments((current) => current.filter((a) => a.id !== attachmentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToDeleteAttachment"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async (attachmentId: string) => {
    setError(null);
    const result = await getTaskAttachmentDownloadUrl(projectId, taskId, attachmentId);
    if (result.error || !result.url) {
      setError(result.error ?? t("failedToGetDownloadLink"));
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  return (
    <section aria-label={t("attachments")} className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          {t("attachments")}
          {attachments.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{attachments.length}</span>
          )}
        </h3>
        {canUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFileChosen(file);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
              {uploading ? t("uploadingAttachment") : t("attachTaskFile")}
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("loadingAttachments")}
        </p>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noAttachmentsYet")}</p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((attachment) => {
            const canDelete = canManageProject || attachment.uploaded_by === currentUserId;
            return (
              <li
                key={attachment.id}
                className="group flex items-center gap-2 rounded-md border border-border p-2 text-sm"
              >
                {attachment.mime_type?.startsWith("image/") && imageUrls[attachment.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed, per-attachment URL from any storage provider (local or Supabase), not a static/optimizable asset
                  <img
                    src={imageUrls[attachment.id]}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded object-cover"
                  />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatSize(attachment.size_bytes)}</span>
                <button
                  type="button"
                  aria-label={t("downloadAttachmentAria", { name: attachment.name })}
                  onClick={() => void handleDownload(attachment.id)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                {canDelete && (
                  <button
                    type="button"
                    aria-label={t("deleteAttachmentAria", { name: attachment.name })}
                    disabled={deletingId === attachment.id}
                    onClick={() => void handleDelete(attachment.id)}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100 disabled:opacity-60"
                  >
                    {deletingId === attachment.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
