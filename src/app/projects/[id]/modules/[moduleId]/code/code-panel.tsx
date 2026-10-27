"use client";

import dynamic from "next/dynamic";
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Monaco } from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { ModuleSandboxView } from "@/components/work/module-sandbox-view";
import { MODULE_SDK_DTS } from "@/lib/work/module-sdk";
import type { ModuleManifest } from "@/lib/work/module-manifest";
import type { ModuleRecord } from "@/lib/work/module-records";
import type { SandboxChange } from "@/lib/work/module-sandbox";
import { saveModuleScript } from "./actions";

// Monaco is several MB: only this page loads it, in the browser.
const CodeEditor = dynamic(() => import("@/components/files/code-editor"), { ssr: false });

function addSdk(monaco: Monaco) {
  const typescript = monaco.languages.typescript;
  typescript.javascriptDefaults.setCompilerOptions({ ...typescript.javascriptDefaults.getCompilerOptions(), checkJs: true, allowNonTsExtensions: true, noLib: false });
  typescript.javascriptDefaults.addExtraLib(MODULE_SDK_DTS, "ts:guidon-module-sdk.d.ts");
}

type Log = { level: "log" | "warn" | "error"; text: string };

export function CodePanel({ projectId, moduleId, manifest, records, revision: initialRevision, initialSource, readOnly, needsConsent }: {
  projectId: string; moduleId: string; manifest: ModuleManifest; records: ModuleRecord[]; revision: number; initialSource: string; readOnly: boolean; needsConsent: boolean;
}) {
  const t = useTranslations("moduleSandbox");
  const router = useRouter();
  const [source, setSource] = useState(initialSource);
  const [previewSource, setPreviewSource] = useState(initialSource);
  const [run, setRun] = useState(0);
  const [logs, setLogs] = useState<Log[]>([]);
  const [proposed, setProposed] = useState<SandboxChange | null>(null);
  const [revision, setRevision] = useState(initialRevision);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const onLog = useCallback((log: Log) => setLogs((previous) => [...previous.slice(-199), log]), []);
  // The preview never saves: it shows what the script would change.
  const onPreviewChange = useCallback(async (change: SandboxChange) => { setProposed(change); return null; }, []);
  const previewManifest = { ...manifest, script: { source: previewSource } };

  return <div className="grid min-w-0 gap-4 lg:grid-cols-2">
    <div className="min-w-0 space-y-3">
      <div className="h-[28rem] overflow-hidden rounded-md border"><CodeEditor path={`module-${moduleId}.js`} language="javascript" value={source} onChange={setSource} readOnly={readOnly} onMonacoReady={addSdk} /></div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => { setLogs([]); setProposed(null); setPreviewSource(source); setRun((value) => value + 1); }}>{t("runPreview")}</Button>
        {!readOnly && <Button disabled={pending || (needsConsent && !consent) || !source.trim()} onClick={() => start(async () => {
          const result = await saveModuleScript(projectId, moduleId, source, revision, consent);
          if (result.error) setStatus(t(`error.${result.error}`) + (result.detail ? ` (${result.detail})` : ""));
          else { setRevision(result.revision); setStatus(t("saved")); router.refresh(); }
        })}>{pending ? t("saving") : t("save")}</Button>}
      </div>
      {!readOnly && needsConsent && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{t("consent")}</span></label>}
      {status && <p role="status" className="text-sm">{status}</p>}
    </div>
    <div className="min-w-0 space-y-3">
      <section className="space-y-2 rounded-md border p-3" aria-labelledby="sandbox-preview"><h2 id="sandbox-preview" className="text-sm font-semibold">{t("preview")}</h2>
        <ModuleSandboxView key={run} manifest={previewManifest} source={previewSource} records={records} canWrite onChange={onPreviewChange} onLog={onLog} />
        {proposed && <p role="status" className="text-xs text-muted-foreground">{t("wouldSave", { upserts: proposed.upsert?.length ?? 0, removals: proposed.remove?.length ?? 0 })}</p>}
      </section>
      <section className="space-y-1 rounded-md border p-3" aria-labelledby="sandbox-log"><h2 id="sandbox-log" className="text-sm font-semibold">{t("log")}</h2>
        {!logs.length ? <p className="text-xs text-muted-foreground">{t("logEmpty")}</p> : <ol className="max-h-48 space-y-0.5 overflow-auto font-mono text-xs">{logs.map((log, index) => <li key={index} className={`whitespace-pre-wrap break-words ${log.level === "error" ? "text-destructive" : log.level === "warn" ? "text-warning" : ""}`}>{log.text}</li>)}</ol>}
      </section>
    </div>
  </div>;
}
