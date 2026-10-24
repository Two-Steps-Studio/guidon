"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ModulePermissionList } from "@/lib/work/module-catalog";
import type { ModulePlan } from "@/lib/work/module-builder";
import type { ModuleManifest } from "@/lib/work/module-manifest";
import { planProjectModule, compileProjectModule } from "./builder-actions";
import { createModulePackage } from "./package-actions";

export function ModuleBuilder({ projectId, aiEnabled }: { projectId: string; aiEnabled: boolean }) {
  const t = useTranslations("moduleBuilder");
  const runtime = useTranslations("moduleRuntime");
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<ModulePlan | null>(null);
  const [manifest, setManifest] = useState<ModuleManifest | null>(null);
  const [approved, setApproved] = useState(false);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("");
  const [requestId, setRequestId] = useState("");
  const [pending, startTransition] = useTransition();
  const permissions = <ModulePermissionList permissions={manifest?.permissions ?? plan?.permissions ?? []} labels={{ read: runtime("permissionRead"), write: runtime("permissionWrite"), none: runtime("permissionNone") }} />;
  return <Card className="min-w-0"><CardHeader><CardTitle>{t("title")}</CardTitle><CardDescription>{t("description")}</CardDescription></CardHeader><CardContent className="space-y-4">
    {!aiEnabled ? <p className="text-sm text-muted-foreground">{t("aiDisabled")}</p> : <>
      <p className="text-sm text-muted-foreground">{t("privacy")}</p>
      <label className="block space-y-2"><span className="text-sm font-medium">{t("prompt")}</span><Textarea rows={5} maxLength={6000} value={prompt} disabled={pending} onChange={(event) => { setPrompt(event.target.value); setPlan(null); setManifest(null); setApproved(false); setConsent(false); setStatus(""); }} /></label>
      <Button disabled={pending || !prompt.trim()} onClick={() => startTransition(async () => {
        setStatus(""); setPlan(null); setManifest(null); setApproved(false); setConsent(false);
        try {
          const result = await planProjectModule(projectId, prompt);
          setRequestId(result.requestId);
          if (result.error) setStatus(t(result.error)); else setPlan(result.value);
        } catch { setStatus(t("providerFailed")); }
      })}>{pending ? t("working") : t("plan")}</Button>
      {plan && <section className="space-y-4 rounded-md border p-4" aria-label={t("review")}>
        <h3 className="break-words font-semibold">{plan.name}</h3><p className="whitespace-pre-wrap break-words text-sm">{plan.summary}</p>
        {plan.questions.length > 0 && <div className="space-y-2"><h4 className="font-medium">{t("questions")}</h4><ul className="list-inside list-disc text-sm">{plan.questions.map((question, index) => <li key={index}>{question}</li>)}</ul><p className="text-sm text-muted-foreground">{t("answerHint")}</p></div>}
        <h4 className="text-sm font-medium">{t("entities")}</h4><ul className="space-y-2 text-sm">{plan.entities.map((entity) => <li key={entity.id} className="break-words"><strong>{entity.name}</strong><ul className="ml-4 list-inside list-disc">{entity.fields.map((field) => <li key={field.id}>{field.name} · {field.type}{field.required ? ` · ${t("required")}` : ""}{field.type === "select" ? ` · ${field.options.map((option) => option.label).join(", ")}` : ""}{field.type === "number" && (field.min !== undefined || field.max !== undefined) ? ` · ${field.min ?? "−∞"} … ${field.max ?? "∞"}` : ""}{field.type === "text" && field.maxLength ? ` · ${t("maxLength", { count: field.maxLength })}` : ""}</li>)}</ul></li>)}</ul>
        <h4 className="text-sm font-medium">{t("views")}</h4><ul className="list-inside list-disc text-sm">{plan.views.map((view) => <li key={view.id} className="break-words">{view.name} · {view.type} · {view.entity} ({view.fields.join(", ")}){"groupBy" in view && view.groupBy ? ` · ${view.groupBy}` : ""}{"dateField" in view ? ` · ${view.dateField}` : ""}</li>)}</ul>
        <p className="text-sm text-muted-foreground">{t("relations")}</p>{permissions}
        {!manifest && <><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} disabled={pending || plan.questions.length > 0} onChange={(event) => setApproved(event.target.checked)} /><span>{t("approval")}</span></label>
          <Button disabled={pending || !approved || plan.questions.length > 0} onClick={() => startTransition(async () => {
            try {
              const result = await compileProjectModule(projectId, plan, approved);
              setRequestId(result.requestId);
              if (result.error) setStatus(t(result.error)); else { setManifest(result.value); setStatus(t("generated")); }
            } catch { setStatus(t("providerFailed")); }
          })}>{t("generate")}</Button></>}
      </section>}
      {manifest && <section className="space-y-3 rounded-md border p-4"><h3 className="font-medium">{t("generated")}</h3>
        <label className="block space-y-2"><span className="text-sm">{runtime("manifest")}</span><Textarea readOnly value={JSON.stringify(manifest, null, 2)} rows={8} className="font-mono text-xs" /></label>
        <Button variant="outline" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = `${manifest.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>{t("download")}</Button>
        {permissions}<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={pending} onChange={(event) => setConsent(event.target.checked)} /><span>{runtime("consentLabel")}</span></label>
        <Button disabled={pending || !consent} onClick={() => startTransition(async () => {
          try {
            const result = await createModulePackage(projectId, manifest, manifest.permissions);
            if (result.error) setStatus(runtime(result.error)); else { setStatus(runtime("installed")); setManifest(null); setPlan(null); setApproved(false); setConsent(false); router.refresh(); }
          } catch { setStatus(runtime("saveFailed")); }
        })}>{runtime("install")}</Button>
      </section>}
    </>}
    <p role="status" className="break-words text-sm">{status}</p>
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">{requestId && <span>{t("requestId")}: {requestId}</span>}<Link href={`/projects/${projectId}/activity`} className="text-primary underline">{t("logs")}</Link></div>
  </CardContent></Card>;
}
