"use client";

import { useTranslations } from "next-intl";
import { SelectMenu } from "@/components/ui/select-menu";
import { SOUND_OPTIONS, playSound, setSoundSetting, useSoundSetting, type SoundSetting } from "@/lib/sounds";

export function SoundSwitcher() {
  const t = useTranslations("profile");
  const setting = useSoundSetting();

  return (
    <SelectMenu
      aria-label={t("soundsLabel")}
      value={setting}
      options={SOUND_OPTIONS.map((value) => ({ value, label: t(`sounds_${value}`) }))}
      onValueChange={(value) => {
        setSoundSetting(value as SoundSetting);
        // A sample right away, so turning them on answers "what do they sound like".
        if (value === "on") playSound("complete");
      }}
    />
  );
}
