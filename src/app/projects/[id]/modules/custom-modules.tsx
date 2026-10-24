"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { CUSTOM_MODULE_AI_PROMPT, CUSTOM_MODULE_PRESETS, customModuleSchema, customModulesSchema, type CustomModule } from "@/lib/work/custom-modules";
import { renderCustomModuleBlocks } from "@/lib/work/custom-module-renderer";
import { saveCustomModules } from "./actions";

export function CustomModules({ projectId, initial, initialRevision, canManage }: {
  projectId: string; initial: CustomModule[]; initialRevision: number; canManage: boolean;
}) {
  const t = useTranslations("customModules");
  const [modules, setModules] = useState(initial);
  const [revision, setRevision] = useState(initialRevision);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function update(next: CustomModule[]) { setModules(next); setDirty(true); setStatus(""); }
  function applyDraft() {
    try {
      const parsedModule = customModuleSchema.parse(JSON.parse(draft));
      const next = editing ? modules.map((item) => item.id === editing ? parsedModule : item) : [...modules, parsedModule];
      const parsed = customModulesSchema.safeParse(next);
      if (!parsed.success) throw new Error();
      update(parsed.data); setDraft(""); setEditing(null);
    } catch { setStatus(t("invalid")); }
  }
  function exportModules() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(modules, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "guidon-modules.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <div className="space-y-6">
    {canManage && <Card>
      <CardHeader><CardTitle>{t("catalog")}</CardTitle><CardDescription>{t("catalogHint")}</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">{CUSTOM_MODULE_PRESETS.map((preset) => <Button key={preset.id} variant="outline" disabled={pending || modules.length >= 20} onClick={() => {
          const copy = structuredClone(preset); copy.id = `${preset.id}-${crypto.randomUUID().slice(0, 8)}`;
          setDraft(JSON.stringify(copy, null, 2)); setEditing(null);
        }}>{t(preset.id === "release" ? "releasePreset" : "researchPreset")}</Button>)}</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending} onClick={() => input.current?.click()}>{t("import")}</Button>
          <Button variant="outline" onClick={exportModules}>{t("export")}</Button>
          <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(CUSTOM_MODULE_AI_PROMPT); setStatus(t("copied")); } catch { setStatus(t("copyFailed")); } }}>{t("prompt")}</Button>
        </div>
        <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
          if (file.size > 100000) { setStatus(t("invalid")); return; }
          try { const json = JSON.parse(await file.text()); const next = customModulesSchema.parse([...modules, ...(Array.isArray(json) ? json : [json])]); update(next); } catch { setStatus(t("invalid")); }
        }} />
        <label className="block space-y-2"><span className="text-sm font-medium">{t("editor")}</span>
          <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={10} className="font-mono text-xs" placeholder={t("editorHint")} disabled={pending} />
        </label>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!draft || pending} onClick={applyDraft}>{t("apply")}</Button>
          {editing && <Button variant="ghost" onClick={() => { setDraft(""); setEditing(null); }}>{t("cancel")}</Button>}
          <Button disabled={!dirty || pending} onClick={() => startTransition(async () => {
            try { const result = await saveCustomModules(projectId, modules, revision);
              if (result.error) setStatus(t(result.error)); else { setRevision(result.revision!); setDirty(false); setStatus(t("saved")); }
            } catch { setStatus(t("saveFailed")); }
          })}>{pending ? t("saving") : t("save")}</Button>
        </div>
        <p role="status" className="text-sm">{status || (dirty ? t("unsaved") : "")}</p>
      </CardContent>
    </Card>}
    {modules.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">{modules.map((module, moduleIndex) => <Card key={module.id} className="min-w-0">
      <CardHeader><CardTitle>{module.title}</CardTitle><CardDescription>{module.description}</CardDescription>
        {canManage && <div className="flex gap-2 pt-2"><Button size="sm" variant="outline" disabled={pending} onClick={() => { setEditing(module.id); setDraft(JSON.stringify(module, null, 2)); }}>{t("edit")}</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => update(modules.filter((item) => item.id !== module.id))}>{t("remove")}</Button></div>}
      </CardHeader>
      <CardContent className="space-y-5">{renderCustomModuleBlocks(module, moduleIndex, canManage, pending, (changedModuleIndex, blockIndex, itemIndex, checked) => {
        const next = structuredClone(modules);
        const target = next[changedModuleIndex].blocks[blockIndex];
        if (target.type === "checklist") target.items[itemIndex].done = checked;
        update(next);
      })}</CardContent>
    </Card>)}</div>
  </div>;
}
