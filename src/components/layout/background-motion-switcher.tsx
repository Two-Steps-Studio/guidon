"use client";

import { useTranslations } from "next-intl";
import { SelectMenu } from "@/components/ui/select-menu";
import { BACKGROUND_MOTION_OPTIONS, setBackgroundMotion, useBackgroundMotion, type BackgroundMotion } from "@/lib/background-motion";
import { BACKGROUND_STYLES, setBackgroundStyle, useBackgroundStyle, type BackgroundStyle } from "@/lib/background-style";

export function BackgroundMotionSwitcher() {
  const t = useTranslations("profile");
  const motion = useBackgroundMotion();
  const style = useBackgroundStyle();

  return (
    <div className="space-y-2"><SelectMenu aria-label={t("backgroundStyleLabel")} value={style} options={BACKGROUND_STYLES.map(value => ({ value, label: t(`backgroundStyle_${value}`) }))} onValueChange={value => setBackgroundStyle(value as BackgroundStyle)} />
    <span className="block text-sm font-medium">{t("backgroundMotionLabel")}</span>
    <SelectMenu
      aria-label={t("backgroundMotionLabel")}
      value={motion}
      options={BACKGROUND_MOTION_OPTIONS.map((value) => ({ value, label: t(`backgroundMotion_${value}`) }))}
      onValueChange={(value) => setBackgroundMotion(value as BackgroundMotion)}
      disabled={style === "solid"}
    />
    </div>
  );
}
