"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { animate, motion, useMotionValue } from "motion/react";
import { useReducedMotionPreference } from "@/lib/use-reduced-motion";
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
  const x = useMotionValue(0);
  const reduceMotion = useReducedMotionPreference();
  const serial = useRef(0);
  const gesture = useRef<{ id: number; startX: number; startY: number; offset: number; axis: "pending" | "x" | "y"; samples: { x: number; time: number }[] } | null>(null);
  const open = index !== null && images[index] !== undefined;
  const current = open ? images[index] : null;
  const count = images.length;
  const cancel = () => { gesture.current = null;serial.current++;animate(x, 0, reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }); };
  const changeImage = useCallback((next: number) => { gesture.current = null;serial.current++;x.stop();x.set(0);onIndexChange(next); }, [onIndexChange,x]);
  useEffect(() => () => { x.stop(); }, [x]);

  useEffect(() => {
    if (index === null || count < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") changeImage((index + 1) % count);
      if (event.key === "ArrowLeft") changeImage((index - 1 + count) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count, changeImage]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { cancel();onClose(); } }}>
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
                className="flex size-11 shrink-0 items-center justify-center rounded text-white/80 hover:bg-white/10 hover:text-white"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => { cancel();onClose(); }}
                aria-label={t("close")}
                className="flex size-11 shrink-0 items-center justify-center rounded text-white/80 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div
              className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 pb-4 sm:px-14"
              style={{ touchAction: "pan-y pinch-zoom" }}
              onPointerDown={event => {
                if (count < 2 || event.button !== 0 || (event.target as HTMLElement).closest("button,a")) return;
                serial.current++;x.stop();
                gesture.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, offset: x.get(), axis: "pending", samples: [{ x: event.clientX, time: event.timeStamp }] };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={event => {
                const drag = gesture.current;if (!drag || drag.id !== event.pointerId) return;
                const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
                if (drag.axis === "pending" && Math.hypot(dx,dy) >= 10) drag.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
                if (drag.axis !== "x") return;
                event.preventDefault();x.set(drag.offset + dx);
                drag.samples.push({ x: event.clientX, time: event.timeStamp });
                drag.samples = drag.samples.filter(sample => event.timeStamp - sample.time <= 100).slice(-6);
              }}
              onPointerCancel={cancel}
              onLostPointerCapture={() => { if (gesture.current) cancel(); }}
              onPointerUp={event => {
                const drag = gesture.current;if (!drag || drag.id !== event.pointerId) return;
                gesture.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                const first = drag.samples[0], last = drag.samples.at(-1)!;
                const velocity = event.timeStamp - last.time > 120 ? 0 : (last.x - first.x) / Math.max(1,last.time - first.time) * 1000;
                // Exponential scroll-style projection, with a snappy decay.
                const projected = x.get() + (velocity / 1000) * 0.99 / (1 - 0.99);
                const threshold = Math.min(100, event.currentTarget.clientWidth * 0.22);
                if (drag.axis !== "x" || Math.abs(projected) < threshold) { animate(x, 0, reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38, velocity });return; }
                const next = projected < 0 ? (index + 1) % count : (index - 1 + count) % count;
                const token = serial.current;
                if (reduceMotion) { x.set(0);onIndexChange(next);return; }
                animate(x, projected < 0 ? -event.currentTarget.clientWidth : event.currentTarget.clientWidth, { type: "spring", stiffness: 420, damping: 38, velocity, onComplete: () => { if (serial.current !== token) return;x.set(0);onIndexChange(next); } });
              }}
            >
              <motion.img key={current.id} draggable={false} style={{ x }} src={current.url} alt={current.name} className="max-h-full max-w-full select-none object-contain" />
              {count > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => changeImage((index - 1 + count) % count)}
                    aria-label={t("previous")}
                    className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20 sm:block"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => changeImage((index + 1) % count)}
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
