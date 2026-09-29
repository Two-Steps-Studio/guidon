"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink, ImagePlus, Images, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { deleteReference, updateReference, uploadReference, type ProjectReference } from "./actions";

function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith("image/"));
}

/** Clipboard screenshots arrive as "image.png" - same renaming as task paste (use-image-paste.ts). */
function friendlyName(file: File): File {
  if (file.name && file.name !== "image.png") return file;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return new File([file], `reference-${stamp}.${ext}`, { type: file.type });
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Project moodboard: reference images and concept art with captions and
 * tags (project_references, migration 048). Add images with the button,
 * by dropping them anywhere on the page, or by pasting (Ctrl/Cmd+V)
 * while not typing in a field. Masonry layout keeps each image's own
 * aspect ratio; clicking one opens the shared full-screen viewer over the
 * currently filtered set.
 */
export function MoodboardBoard({
  projectId,
  initialReferences,
  loadError,
  currentUserId,
  canUpload,
  canManage,
  title,
  subtitle,
}: {
  projectId: string;
  initialReferences: ProjectReference[];
  loadError: string | null;
  currentUserId: string;
  canUpload: boolean;
  canManage: boolean;
  title: string;
  subtitle: string;
}) {
  const t = useTranslations("moodboard");
  const [references, setReferences] = useState(initialReferences);
  const [uploading, setUploading] = useState(0);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<ProjectReference | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const reference of references) for (const tag of reference.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [references]);

  const visible = activeTag ? references.filter((r) => r.tags.includes(activeTag)) : references;
  const lightboxImages = visible
    .filter((r) => r.url)
    .map((r) => ({ id: r.id, name: r.name, url: r.url as string, caption: r.caption }));

  const canEdit = (reference: ProjectReference) => canManage || reference.uploaded_by === currentUserId;

  const addFiles = async (files: File[]) => {
    if (!canUpload || files.length === 0) return;
    setUploading((n) => n + files.length);
    await Promise.all(
      files.map(async (raw) => {
        const formData = new FormData();
        formData.append("file", friendlyName(raw));
        // New images land in the tag being viewed, so they don't vanish from a filtered view.
        if (activeTag) formData.append("tags", activeTag);
        const result = await uploadReference(projectId, formData);
        setUploading((n) => n - 1);
        if (result.error || !result.reference) {
          toast.error(result.error ?? t("uploadFailed"));
          return;
        }
        const reference = result.reference;
        setReferences((current) => [reference, ...current]);
      })
    );
  };

  // Paste anywhere on the page (except while typing in a field).
  const addFilesRef = useRef(addFiles);
  useEffect(() => {
    addFilesRef.current = addFiles;
  });
  useEffect(() => {
    if (!canUpload) return;
    const onPaste = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const files = imageFiles(event.clipboardData?.files);
      if (files.length === 0) return;
      event.preventDefault();
      void addFilesRef.current(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [canUpload]);

  const handleDelete = async (reference: ProjectReference) => {
    if (!window.confirm(t("confirmDelete", { name: reference.caption || reference.name }))) return;
    const result = await deleteReference(projectId, reference.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setReferences((current) => current.filter((r) => r.id !== reference.id));
    toast.success(t("deleted"));
  };

  return (
    <div
      className="relative min-h-[60vh]"
      onDragEnter={(event) => {
        if (!canUpload || !event.dataTransfer.types.includes("Files")) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (canUpload && event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (!canUpload) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void addFiles(imageFiles(event.dataTransfer.files));
      }}
    >
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        {canUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={(event) => {
                void addFiles(imageFiles(event.target.files));
                event.target.value = "";
              }}
            />
            <Button onClick={() => fileInputRef.current?.click()}>
              <ImagePlus className="h-4 w-4" />
              {t("addImages")}
            </Button>
          </>
        )}
      </div>

      {loadError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {loadError}
        </p>
      )}

      {tags.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={t("filterByTag")}>
          <TagChip label={t("allTags", { count: references.length })} active={activeTag === null} onClick={() => setActiveTag(null)} />
          {tags.map(([tag, count]) => (
            <TagChip
              key={tag}
              label={`#${tag} · ${count}`}
              active={activeTag === tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            />
          ))}
        </div>
      )}

      {references.length === 0 && uploading === 0 ? (
        <EmptyState
          icon={Images}
          title={t("emptyTitle")}
          description={canUpload ? t("emptyDescription") : t("emptyDescriptionReadOnly")}
          action={
            canUpload ? (
              <Button onClick={() => fileInputRef.current?.click()}>
                <ImagePlus className="h-4 w-4" />
                {t("addImages")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {canUpload && <p className="mb-4 text-xs text-muted-foreground">{t("pasteHint")}</p>}
          <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">
            {Array.from({ length: uploading }).map((_, i) => (
              <div
                key={`uploading-${i}`}
                className="mb-3 flex aspect-[4/3] break-inside-avoid items-center justify-center rounded-lg border border-dashed border-border bg-muted text-sm text-muted-foreground"
              >
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("uploading")}
              </div>
            ))}
            {visible.map((reference) => {
              const index = lightboxImages.findIndex((image) => image.id === reference.id);
              return (
                <figure
                  key={reference.id}
                  className="group relative mb-3 break-inside-avoid overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                >
                  <button
                    type="button"
                    className="block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => index >= 0 && setLightboxIndex(index)}
                    aria-label={t("openImage", { name: reference.caption || reference.name })}
                  >
                    {reference.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed URL from any storage provider (local or Supabase), not a static/optimizable asset
                      <img src={reference.url} alt={reference.caption || reference.name} className="w-full" loading="lazy" />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center bg-muted text-xs text-muted-foreground">
                        {reference.name}
                      </div>
                    )}
                  </button>
                  {(reference.caption || reference.tags.length > 0) && (
                    <figcaption className="space-y-1 px-3 py-2">
                      {reference.caption && <p className="text-sm text-foreground">{reference.caption}</p>}
                      {reference.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {reference.tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setActiveTag(tag)}
                              className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </figcaption>
                  )}
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
                    {reference.source_url && (
                      <a
                        href={reference.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t("openSource")}
                        className="rounded-md bg-background/90 p-1.5 text-foreground shadow-sm hover:bg-background"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {canEdit(reference) && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditing(reference)}
                          aria-label={t("editImage")}
                          className="rounded-md bg-background/90 p-1.5 text-foreground shadow-sm hover:bg-background"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(reference)}
                          aria-label={t("deleteImage")}
                          className="rounded-md bg-background/90 p-1.5 text-destructive shadow-sm hover:bg-background"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </figure>
              );
            })}
          </div>
        </>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5">
          <p className="rounded-md bg-background px-4 py-2 text-sm font-medium shadow">{t("dropHere")}</p>
        </div>
      )}

      <ImageLightbox
        images={lightboxImages}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />

      {editing && (
        <EditReferenceDialog
          key={editing.id}
          projectId={projectId}
          reference={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setReferences((current) => current.map((r) => (r.id === updated.id ? updated : r)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function TagChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function EditReferenceDialog({
  projectId,
  reference,
  onClose,
  onSaved,
}: {
  projectId: string;
  reference: ProjectReference;
  onClose: () => void;
  onSaved: (reference: ProjectReference) => void;
}) {
  const t = useTranslations("moodboard");
  const [caption, setCaption] = useState(reference.caption ?? "");
  const [tags, setTags] = useState(reference.tags.join(", "));
  const [sourceUrl, setSourceUrl] = useState(reference.source_url ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await updateReference(projectId, reference.id, {
      caption,
      tags: tags.split(","),
      sourceUrl,
    });
    setSaving(false);
    if (result.error || !result.reference) {
      setError(result.error ?? t("saveFailed"));
      return;
    }
    onSaved(result.reference);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription className="truncate">{reference.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          {reference.url && (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL from any storage provider, not a static asset
            <img src={reference.url} alt="" className="max-h-48 w-full rounded-md object-contain bg-muted" />
          )}
          <div className="space-y-2">
            <Label htmlFor="reference-caption">{t("captionLabel")}</Label>
            <Input id="reference-caption" value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reference-tags">{t("tagsLabel")}</Label>
            <Input
              id="reference-tags"
              value={tags}
              placeholder={t("tagsPlaceholder")}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reference-source">{t("sourceLabel")}</Label>
            <Input
              id="reference-source"
              type="url"
              value={sourceUrl}
              placeholder="https://"
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
