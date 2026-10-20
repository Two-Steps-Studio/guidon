"use client";

import { useTranslations } from "next-intl";
import { SelectMenu } from "@/components/ui/select-menu";
import { BACKGROUND_MOTION_OPTIONS, setBackgroundMotion, useBackgroundMotion, type BackgroundMotion } from "@/lib/background-motion";

export function BackgroundMotionSwitcher() {
  const t = useTranslations("profile");
  const motion = useBackgroundMotion();

  return (
    <SelectMenu
      aria-label={t("backgroundMotionLabel")}
      value={motion}
      options={BACKGROUND_MOTION_OPTIONS.map((value) => ({ value, label: t(`backgroundMotion_${value}`) }))}
      onValueChange={(value) => setBackgroundMotion(value as BackgroundMotion)}
    />
  );
}
