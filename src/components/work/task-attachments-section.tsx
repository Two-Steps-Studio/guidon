"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, FileText, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTaskAttachments } from "@/components/work/task-attachments-context";

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The task's full file list. Data lives in TaskAttachmentsProvider (shared
 * with the image gallery and inline images); this only owns its own
 * upload/delete-in-progress and error state.
 */
export function TaskAttachmentsSection({
  canUpload,
  currentUserId,
  canManageProject,
}: {
  canUpload: boolean;
  currentUserId: string | null;
  /** Owner/admin can delete any attachment; anyone can delete their own (task_attachments_delete's actual RLS boundary - this only controls the button, RLS still re-checks server-side). */
  canManageProject: boolean;
}) {
  const t = useTranslations("work");
  const { attachments, loading, error: loadError, imageUrls, upload, remove, downloadUrl } = useTaskAttachments();
  const [actionError, setActionError] = useState<string | null>(null);
  const error = actionError ?? loadError;
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChosen = async (file: File) => {
    setUploading(true);
    setActionError(null);
    const result = await upload(file);
    if (result.error) setActionError(result.error || t("failedToUploadAttachment"));
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (attachmentId: string) => {
    setDeletingId(attachmentId);
    setActionError(null);
    const result = await remove(attachmentId);
    if (result.error) setActionError(result.error || t("failedToDeleteAttachment"));
    setDeletingId(null);
  };

  const handleDownload = async (attachmentId: string) => {
    setActionError(null);
    const result = await downloadUrl(attachmentId);
    if (result.error || !result.url) {
      setActionError(result.error ?? t("failedToGetDownloadLink"));
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
