"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ImageLightbox, type LightboxImage } from "@/components/ui/image-lightbox";
import { useTaskAttachments } from "@/components/work/task-attachments-context";
import { cn } from "@/lib/utils";

export type GalleryImage = LightboxImage;

/** Image attachments that have a signed URL, newest first (the attachment list's own order). */
export function useGalleryImages(): GalleryImage[] {
  const { attachments, imageUrls } = useTaskAttachments();
  return attachments
    .filter((a) => a.mime_type?.startsWith("image/") && imageUrls[a.id])
    .map((a) => ({ id: a.id, name: a.name, url: imageUrls[a.id] }));
}

/**
 * Thumbnail grid of the task's image attachments, right under the
 * description. Renders nothing when there are no images - the file list
 * further down owns the empty state and the upload button.
 */
export function TaskImageGallery() {
  const t = useTranslations("work");
  const images = useGalleryImages();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">
        {t("images")}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">{images.length}</span>
      </h3>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {images.map((image, i) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            aria-label={t("openImageAria", { name: image.name })}
            className={cn(
              "aspect-square overflow-hidden rounded-md border border-border bg-muted",
              "transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed, per-attachment URL from any storage provider (local or Supabase), not a static/optimizable asset */}
            <img src={image.url} alt="" className="h-full w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
      <ImageLightbox images={images} index={openIndex} onIndexChange={setOpenIndex} onClose={() => setOpenIndex(null)} />
    </div>
  );
}
