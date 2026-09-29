"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export interface LightboxImage {
  id: string;
  name: string;
  url: string;
  /** Optional line under the file name (e.g. a moodboard caption). */
  caption?: string | null;
}

/**
 * Full-screen viewer: arrow buttons, ←/→ keys, swipe on touch screens,
 * Esc (via Dialog) to close.
 */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("lightbox");
  const touchStartX = useRef<number | null>(null);
  const open = index !== null && images[index] !== undefined;
  const current = open ? images[index] : null;
  const count = images.length;

  useEffect(() => {
    if (index === null || count < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") onIndexChange((index + 1) % count);
      if (event.key === "ArrowLeft") onIndexChange((index - 1 + count) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count, onIndexChange]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[92vh] max-w-[96vw] flex-col gap-0 border-none bg-black/95 p-0 text-white sm:max-w-[96vw]"
      >
        <DialogTitle className="sr-only">{current?.name ?? t("title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("hint")}</DialogDescription>
        {current && index !== null && (
          <>
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {current.name}
                {current.caption && <span className="ml-2 text-white/60">{current.caption}</span>}
              </span>
              {count > 1 && (
                <span className="shrink-0 tabular-nums text-white/70">
                  {index + 1} / {count}
                </span>
              )}
              <a
                href={current.url}
                target="_blank"
                rel="noopener noreferrer"
                download={current.name}
                aria-label={t("download", { name: current.name })}
                className="shrink-0 rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("close")}
                className="shrink-0 rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div
              className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-14"
              onTouchStart={(event) => {
                touchStartX.current = event.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                const start = touchStartX.current;
                const end = event.changedTouches[0]?.clientX;
                touchStartX.current = null;
                if (start === null || end === undefined || count < 2) return;
                const dx = end - start;
                if (Math.abs(dx) < 50) return;
                onIndexChange(dx < 0 ? (index + 1) % count : (index - 1 + count) % count);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed, per-attachment URL from any storage provider (local or Supabase), not a static/optimizable asset */}
              <img src={current.url} alt={current.name} className="max-h-full max-w-full select-none object-contain" />
              {count > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => onIndexChange((index - 1 + count) % count)}
                    aria-label={t("previous")}
                    className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20 sm:block"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onIndexChange((index + 1) % count)}
                    aria-label={t("next")}
                    className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20 sm:block"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
