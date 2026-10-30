"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { squareCrop } from "@/lib/image-crop";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

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
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydrated, serverHydrated);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [fileName, setFileName] = useState("image.webp");
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [processing, setProcessing] = useState(false);
  const rectangle = dimensions ? squareCrop(dimensions.width, dimensions.height, zoom, x, y) : null;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (source?.startsWith("blob:")) URL.revokeObjectURL(source); }, [source]);

  const crop = () => {
    const image = imageRef.current;
    const input = inputRef.current;
    const originalFile = input?.files?.[0];
    if (!image || !originalFile || !rectangle || processing) return;
    const { sx, sy, side } = rectangle;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) { setError(t("failed")); return; }
    setProcessing(true);
    context.drawImage(image, sx, sy, side, side, 0, 0, 512, 512);
    canvas.toBlob((blob) => {
      // Closing the cropper or choosing another file cancels this export.
      if (inputRef.current?.files?.[0] !== originalFile) return;
      setProcessing(false);
      if (!blob) { setError(t("failed")); return; }
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
        disabled={!hydrated}
        name={name}
        accept={accept}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground hover:file:bg-primary/90"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) return;
          setFileName(file.name);
          setZoom(1); setX(0); setY(0); setError(null);
          setDimensions(null); setProcessing(false);
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
                <Image key={source} ref={imageRef} src={source} alt="" width={512} height={512} unoptimized
                  className="absolute max-w-none"
                  style={rectangle?.style ?? { width: "100%", height: "100%", opacity: 0 }}
                  onLoad={event => { const image = event.currentTarget; if (image.isConnected) setDimensions({ width: image.naturalWidth, height: image.naturalHeight }); }}
                  onError={() => { setDimensions(null); setError(t("failed")); }}
                />
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
            <Button type="button" variant="outline" onClick={() => { if (inputRef.current) inputRef.current.value = "";setSource(null); }}>{t("cancel")}</Button>
            <Button type="button" onClick={crop} disabled={!rectangle || processing}>{t("apply")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {currentImage && <span className="sr-only">{t("currentImage")}</span>}
    </>
  );
}
