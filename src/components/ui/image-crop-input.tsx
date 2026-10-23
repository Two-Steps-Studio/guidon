"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Square crop picker that keeps the resulting File in the parent form. */
export function ImageCropInput({
  name,
  id,
  accept = "image/*",
  currentImage,
  onReady,
}: {
  name: string;
  id?: string;
  accept?: string;
  currentImage?: string | null;
  onReady?: () => void;
}) {
  const t = useTranslations("common.imageCrop");
  const inputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [fileName, setFileName] = useState("image.webp");
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (source?.startsWith("blob:")) URL.revokeObjectURL(source); }, [source]);

  const crop = () => {
    const image = imageRef.current;
    const input = inputRef.current;
    if (!image || !input?.files?.[0]) return;
    const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    const maxX = image.naturalWidth - side;
    const maxY = image.naturalHeight - side;
    const sx = maxX * (x + 100) / 200;
    const sy = maxY * (y + 100) / 200;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, sx, sy, side, side, 0, 0, 512, 512);
    canvas.toBlob((blob) => {
      if (!blob || !inputRef.current) { setError(t("failed")); return; }
      const file = new File([blob], fileName.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      inputRef.current.files = transfer.files;
      setSource(null);
      setError(null);
      onReady?.();
    }, "image/webp", 0.9);
  };

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="file"
        name={name}
        accept={accept}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground hover:file:bg-primary/90"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) return;
          setFileName(file.name);
          setZoom(1); setX(0); setY(0); setError(null);
          setSource(URL.createObjectURL(file));
        }}
      />
      <Dialog open={Boolean(source)} onOpenChange={(open) => { if (!open) { if (inputRef.current) inputRef.current.value = ""; setSource(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          {source && (
            <div className="space-y-4">
              <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-lg bg-muted">
                <Image ref={imageRef} src={source} alt="" width={512} height={512} unoptimized className="h-full w-full object-cover transition-transform" style={{ transform: `scale(${zoom}) translate(${-x / 2}%, ${-y / 2}%)` }} />
              </div>
              <label className="block space-y-1 text-sm">{t("zoom")}
                <input aria-label={t("zoom")} type="range" min="1" max="3" step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-sm">{t("horizontal")}
                  <input aria-label={t("horizontal")} type="range" min="-100" max="100" value={x} onChange={(e) => setX(Number(e.target.value))} className="w-full" />
                </label>
                <label className="space-y-1 text-sm">{t("vertical")}
                  <input aria-label={t("vertical")} type="range" min="-100" max="100" value={y} onChange={(e) => setY(Number(e.target.value))} className="w-full" />
                </label>
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSource(null)}>{t("cancel")}</Button>
            <Button type="button" onClick={crop}>{t("apply")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {currentImage && <span className="sr-only">{t("currentImage")}</span>}
    </>
  );
}
