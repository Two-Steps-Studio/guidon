"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Plus, Sparkles, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LabelChip } from "@/components/work/label-chip";
import {
  LABEL_COLORS,
  LABEL_NAME_MAX_LENGTH,
  LABEL_STARTER_SETS,
  type LabelPreset,
  type LabelStarterSet,
} from "@/lib/work/label-presets";
import { addLabelPreset, addLabelPresetSet, deleteLabelPreset, updateLabelPreset } from "./label-presets-actions";

function ColorPicker({
  value,
  onChange,
  disabled,
  labelFor,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  labelFor: (color: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {LABEL_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={labelFor(color)}
          disabled={disabled}
          onClick={() => onChange(color)}
          className="size-6 rounded-full border-2 transition-transform disabled:opacity-50 aria-checked:scale-110 aria-checked:border-foreground"
          style={{ backgroundColor: color, borderColor: value === color ? undefined : "transparent" }}
        />
      ))}
    </div>
  );
}

export function LabelPresetsForm({
  projectId,
  initialPresets,
  canManage,
}: {
  projectId: string;
  initialPresets: LabelPreset[];
  canManage: boolean;
}) {
  const t = useTranslations("settings");
  const [presets, setPresets] = useState(initialPresets);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(LABEL_COLORS[6]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const colorLabel = (color: string) => t("labelColorAria", { color });

  const add = () => {
    setError(null);
    startTransition(async () => {
      const result = await addLabelPreset(projectId, newName, newColor);
      if (result.error || !result.preset) {
        setError(result.error);
        return;
      }
      setPresets((prev) => [...prev, result.preset!]);
      setNewName("");
    });
  };

  const addSet = (set: LabelStarterSet) => {
    setError(null);
    const labels = LABEL_STARTER_SETS[set].map(([key, color]) => ({
      // Every (set, key) pair exists in messages; TS can't narrow the
      // cross-product of the two unions, hence the cast.
      name: t(`labelStarter.${set}.${key}` as Parameters<typeof t>[0]),
      color,
    }));
    startTransition(async () => {
      const result = await addLabelPresetSet(projectId, labels);
      if (result.added.length > 0) setPresets((prev) => [...prev, ...result.added]);
      if (result.error) setError(result.error);
    });
  };

  const recolor = (preset: LabelPreset, color: string) => {
    setError(null);
    const previous = presets;
    setPresets((prev) => prev.map((p) => (p.id === preset.id ? { ...p, color } : p)));
    startTransition(async () => {
      const result = await updateLabelPreset(projectId, preset.id, preset.name, color);
      if (result.error) {
        setPresets(previous);
        setError(result.error);
      }
    });
  };

  const remove = (preset: LabelPreset) => {
    setError(null);
    const previous = presets;
    setPresets((prev) => prev.filter((p) => p.id !== preset.id));
    startTransition(async () => {
      const result = await deleteLabelPreset(projectId, preset.id);
      if (result.error) {
        setPresets(previous);
        setError(result.error);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          {t("labelPresetsTitle")}
        </CardTitle>
        <CardDescription>{t("labelPresetsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {presets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("labelPresetsEmpty")}</p>
        ) : (
          <ul className="space-y-3">
            {presets.map((preset) => (
              <li key={preset.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <LabelChip name={preset.name} color={preset.color} />
                  {canManage && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(preset)}
                      disabled={pending}
                      aria-label={t("labelDeleteAria", { name: preset.name })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {canManage && (
                  <ColorPicker
                    value={preset.color}
                    onChange={(color) => recolor(preset, color)}
                    disabled={pending}
                    labelFor={colorLabel}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage ? (
          <form
            className="space-y-3 border-t border-border pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <div className="flex flex-wrap gap-2">
              <Input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={t("labelNamePlaceholder")}
                maxLength={LABEL_NAME_MAX_LENGTH}
                aria-label={t("labelNamePlaceholder")}
                className="min-w-0 flex-1 basis-48"
              />
              <Button type="submit" disabled={pending || !newName.trim()}>
                <Plus className="mr-2 h-4 w-4" />
                {t("labelAdd")}
              </Button>
            </div>
            <ColorPicker value={newColor} onChange={setNewColor} disabled={pending} labelFor={colorLabel} />
            <div className="space-y-2 pt-2">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                {t("labelStarterHint")}
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(LABEL_STARTER_SETS) as LabelStarterSet[]).map((set) => (
                  <Button key={set} type="button" variant="outline" size="sm" disabled={pending} onClick={() => addSet(set)}>
                    {t(`labelStarter.${set}.title`)}
                  </Button>
                ))}
              </div>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{t("labelPresetsManageHint")}</p>
        )}

        {error && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
