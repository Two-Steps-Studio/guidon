"use client";
import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ModuleEditorFrame, type EditorTab } from "@/components/work/module-editor-frame";
import { ModuleDraftPreview } from "@/components/work/module-draft-preview";
import { ModulePlanInspector } from "@/components/work/module-plan-inspector";
import { ModulePermissionList } from "@/lib/work/module-catalog";
import { compileModulePlan } from "@/lib/work/module-builder";
import { validateModulePreview } from "@/lib/work/module-preview";
import { EMPTY_MODULE_DRAFT, type ModuleDraft, type DraftSnapshot } from "@/lib/work/module-draft";
import { useModuleDraft } from "@/lib/work/use-module-draft";
import { planProjectModule, compileProjectModule } from "./builder-actions";
import { saveProjectModuleDraft } from "./draft-actions";
import { createModulePackage } from "./package-actions";

export function ModuleBuilder({ projectId, aiEnabled, initialDraft }: { projectId: string; aiEnabled: boolean; initialDraft: { state: ModuleDraft; revision: number } }) {
  const t = useTranslations("moduleBuilder");
  const e = useTranslations("moduleEditor");
  const r = useTranslations("moduleRuntime");
  const router = useRouter();
  const save = useCallback((state: ModuleDraft, revision: number) => saveProjectModuleDraft(projectId,state,revision),[projectId]);
  const draft = useModuleDraft(initialDraft,save);
  const { prompt, plan, manifest } = draft.state.present;
  const [approved, setApproved] = useState(false);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("");
  const [requestId, setRequestId] = useState("");
  const [tab, setTab] = useState<EditorTab>("chat");
  const [widths, setWidths] = useState([28,52]);
  const [viewId, setViewId] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [pending, startTransition] = useTransition();
  const compiled = plan ? compileModulePlan(plan,true) : null;
  const preview = manifest ?? (compiled?.error === null ? compiled.value : null);
  const validation = preview ? validateModulePreview(preview) : null;
  const permissions = <ModulePermissionList permissions={manifest?.permissions ?? plan?.permissions ?? []} labels={{ read:r("permissionRead"),write:r("permissionWrite"),none:r("permissionNone") }} />;
  function resetApprovals() { setApproved(false); setConsent(false); setStatus(""); }
  function change(snapshot: DraftSnapshot, group = "") { draft.change(snapshot,group); resetApprovals(); }
  function download(value: unknown, name: string) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const chat = <>
    <p className="text-sm text-muted-foreground">{t("privacy")}</p>
    <label className="block space-y-2"><span className="text-sm font-medium">{t("prompt")}</span><Textarea rows={7} maxLength={6000} value={prompt} disabled={pending} onChange={(event)=>change({prompt:event.target.value,plan,manifest},"prompt")} /></label>
    <Button disabled={pending || !prompt.trim()} onClick={()=>startTransition(async()=>{
      resetApprovals();
      try {const result=await planProjectModule(projectId,prompt,plan);setRequestId(result.requestId);if(result.error)setStatus(t(result.error));else{change({prompt,plan:result.value,manifest:null});setTab("inspector");}}catch{setStatus(t("providerFailed"));}
    })}>{pending?t("working"):t("plan")}</Button>
    {plan && <div className="space-y-2"><h4 className="break-words font-semibold">{plan.name}</h4><p className="whitespace-pre-wrap break-words text-sm">{plan.summary}</p>{plan.questions.length>0 && <><h4 className="font-medium">{t("questions")}</h4><ul className="list-inside list-disc text-sm">{plan.questions.map((question,index)=><li key={index}>{question}</li>)}</ul><p className="text-sm text-muted-foreground">{t("answerHint")}</p></>}</div>}
  </>;
  const inspector = <>
    {plan && <ModulePlanInspector key={JSON.stringify(plan)} plan={plan} disabled={pending} onApply={next=>change({prompt,plan:next,manifest:null})} />}
    {plan ? <section className="space-y-3" aria-label={t("review")}>
      <h4 className="text-sm font-medium">{t("entities")}</h4><ul className="space-y-2 text-sm">{plan.entities.map(entity=><li key={entity.id} className="break-words"><strong>{entity.name}</strong><ul className="ml-3 list-inside list-disc">{entity.fields.map(field=><li key={field.id}>{field.name} · {field.type}{field.required?` · ${t("required")}`:""}{field.type==="select"?` · ${field.options.map(option=>option.label).join(", ")}`:""}{field.type==="number" && (field.min!==undefined || field.max!==undefined)?` · ${field.min??"−∞"} … ${field.max??"∞"}`:""}{field.type==="text" && field.maxLength?` · ${t("maxLength",{count:field.maxLength})}`:""}</li>)}</ul></li>)}</ul>
      <h4 className="text-sm font-medium">{t("views")}</h4><ul className="list-inside list-disc text-sm">{plan.views.map(view=><li key={view.id} className="break-words">{view.name} · {view.type} · {view.entity} ({view.fields.join(", ")}){"groupBy" in view && view.groupBy?` · ${view.groupBy}`:""}{"dateField" in view?` · ${view.dateField}`:""}</li>)}</ul>
      <p className="text-sm text-muted-foreground">{t("relations")}</p>{permissions}
      {!manifest && <><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} disabled={pending || plan.questions.length>0} onChange={event=>setApproved(event.target.checked)} /><span>{t("approval")}</span></label><Button disabled={pending || !approved || plan.questions.length>0} onClick={()=>startTransition(async()=>{
        try{const result=await compileProjectModule(projectId,plan,approved);setRequestId(result.requestId);if(result.error)setStatus(t(result.error));else{change({prompt,plan,manifest:result.value});setStatus(t("generated"));}}catch{setStatus(t("providerFailed"));}
      })}>{t("generate")}</Button></>}
    </section> : <p className="text-sm text-muted-foreground">{e("emptyInspector")}</p>}
    {manifest && <section className="space-y-3 border-t pt-3"><h4 className="text-sm font-medium">{t("generated")}</h4><label className="block space-y-2"><span className="text-sm">{r("manifest")}</span><Textarea readOnly value={JSON.stringify(manifest,null,2)} rows={8} className="font-mono text-xs" /></label><Button variant="outline" onClick={()=>download(manifest,`${manifest.id}.json`)}>{t("download")}</Button>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={pending} onChange={event=>setConsent(event.target.checked)} /><span>{r("consentLabel")}</span></label><Button disabled={pending || !consent} onClick={()=>startTransition(async()=>{
        try{const result=await createModulePackage(projectId,manifest,manifest.permissions);if(result.error)setStatus(r(result.error));else{change(EMPTY_MODULE_DRAFT.present);setStatus(r("installed"));router.refresh();}}catch{setStatus(r("saveFailed"));}
      })}>{r("install")}</Button></section>}
    <details className="space-y-2 border-t pt-3"><summary className="cursor-pointer text-sm font-medium">{e("history")}</summary><ol className="space-y-1">{[...draft.state.past,draft.state.present,...draft.state.future].map((snapshot,index)=><li key={index}><button type="button" disabled={pending || index===draft.state.past.length} className="max-w-full truncate text-left text-xs text-primary underline disabled:text-muted-foreground" onClick={()=>{draft.restore(index);resetApprovals();}}>{index+1}. {snapshot.plan?.name ?? (snapshot.prompt.slice(0,35) || e("emptyDraft"))}</button></li>)}</ol></details>
  </>;
  const toolbar = <>
    <Button size="sm" variant="outline" disabled={pending || !draft.state.past.length} onClick={()=>{draft.move("undo");resetApprovals();}}>{e("undo")}</Button><Button size="sm" variant="outline" disabled={pending || !draft.state.future.length} onClick={()=>{draft.move("redo");resetApprovals();}}>{e("redo")}</Button>
    <Button size="sm" variant="outline" disabled={pending || !plan} onClick={()=>{setShowValidation(true);setStatus(!validation || validation.issues.length?t("invalidInput"):e("testPassed"));}}>{e("test")}</Button><Button size="sm" disabled title={e("publishHint")}>{e("publish")}</Button><span role="status" className="text-xs text-muted-foreground">{e(draft.saveState)}</span>
  </>;
  return <Card className="min-w-0"><CardHeader><CardTitle>{t("title")}</CardTitle><CardDescription>{t("description")}</CardDescription></CardHeader><CardContent className="space-y-4">
    {!aiEnabled?<p className="text-sm text-muted-foreground">{t("aiDisabled")}</p>:<ModuleEditorFrame id={`editor-${projectId}`} tab={tab} onTab={setTab} chatWidth={widths[0]} previewWidth={widths[1]} onResize={(chat,preview)=>setWidths([chat,preview])} labels={{chat:e("chat"),preview:e("preview"),inspector:e("inspector"),chatWidth:e("chatWidth"),previewWidth:e("previewWidth")}} toolbar={toolbar} chat={chat} inspector={inspector} preview={<><p className="text-xs text-muted-foreground">{e("previewHint")}</p>{preview?<ModuleDraftPreview manifest={preview} viewId={viewId} onView={setViewId} labels={{view:r("view"),empty:r("empty"),yes:r("yes"),no:r("no"),ungrouped:r("ungrouped"),unscheduled:r("unscheduled"),edit:r("edit"),remove:r("remove"),actions:r("actions"),count:r("count")}} />:<p className="text-sm text-muted-foreground">{e("emptyPreview")}</p>}</>} />}
    {["conflict","saveFailed","permission","invalid"].includes(draft.saveState) && <div role="alert" className="space-y-2 rounded border border-destructive p-3 text-sm"><p>{e("recoveryHint")}</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>download(draft.state,"guidon-draft-backup.json")}>{e("backup")}</Button>{draft.saveState!=="conflict" && <Button variant="outline" onClick={draft.retry}>{e("retry")}</Button>}<Button variant="outline" onClick={()=>window.location.reload()}>{e("reload")}</Button></div></div>}
    {showValidation && <section aria-label={e("validation")} className="space-y-2 rounded border p-3 text-sm"><h3 className="font-medium">{e("validation")}</h3>{validation ? validation.issues.length ? <ul className="list-inside list-disc">{validation.issues.map((issue,index)=><li key={index}>{e(`check_${issue.code}`)} ({issue.path})</li>)}</ul> : <p>{e("testPassed")}</p> : <p>{t("needsAnswers")}</p>}<p className="text-muted-foreground">{e("validationHint")}</p></section>}
    <p role="status" className="break-words text-sm">{status}</p><div className="flex flex-wrap gap-3 text-xs text-muted-foreground">{requestId && <span>{t("requestId")}: {requestId}</span>}<Link href={`/projects/${projectId}/activity`} className="text-primary underline">{t("logs")}</Link></div>
  </CardContent></Card>;
}
