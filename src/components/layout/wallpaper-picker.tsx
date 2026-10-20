"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import {
  WALLPAPER_DIM_OPTIONS,
  prepareWallpaper,
  saveWallpaper,
  setWallpaperDim,
  useWallpaperDim,
  useWallpaperUrl,
  type WallpaperDim,
} from "@/lib/wallpaper";

/** Profile -> Wallpaper: pick, preview, dim or remove this device's background picture. */
export function WallpaperPicker() {
  const t = useTranslations("profile");
  const url = useWallpaperUrl();
  const dim = useWallpaperDim();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await saveWallpaper(await prepareWallpaper(file));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "";
      setError(reason === "too-large" ? t("wallpaperTooLarge") : reason === "not-an-image" ? t("wallpaperNotImage") : t("wallpaperFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, not a next/image candidate
          <img src={url} alt="" className="h-12 w-20 rounded-md border border-border object-cover" />
        )}
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {url ? t("wallpaperChange") : t("wallpaperChoose")}
        </Button>
        {url && (
          <>
            <SelectMenu
              aria-label={t("wallpaperDimLabel")}
              value={dim}
              options={WALLPAPER_DIM_OPTIONS.map((value) => ({ value, label: t("wallpaperDim", { percent: value }) }))}
              onValueChange={(value) => setWallpaperDim(value as WallpaperDim)}
            />
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void saveWallpaper(null)}>
              <Trash2 className="h-4 w-4" />
              {t("wallpaperRemove")}
            </Button>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            void choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
