"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { moduleManifestSchema, type ModuleManifest } from "@/lib/work/module-manifest";
import { ModuleView } from "@/lib/work/module-view";
import { parseModuleRecords, unsupportedModulePermissions, type InstalledModule, type ModuleRecord } from "@/lib/work/module-records";
import example from "../../../../../examples/module-manifests/release-planning.json";
import fixtures from "../../../../../examples/module-manifests/release-planning-data.json";
import { createModulePackage, saveModuleRecords } from "./package-actions";

const inputClass = "w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm";

function RecordForm({ entity, record, pending, onSave, onCancel }: {
  entity: ModuleManifest["entities"][number]; record: ModuleRecord | null; pending: boolean;
  onSave: (record: ModuleRecord) => void; onCancel: () => void;
}) {
  const t = useTranslations("moduleRuntime");
  const prefix = useId();
  return <form className="space-y-4 rounded-lg border bg-muted/20 p-4" onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: ModuleRecord["values"] = {};
    for (const field of entity.fields) {
      const raw = form.get(`field-${field.id}`);
      if (field.type === "boolean") values[field.id] = raw === "on";
      else if (typeof raw === "string" && raw !== "") values[field.id] = field.type === "number" ? Number(raw) : raw;
    }
    onSave({ id: record?.id ?? crypto.randomUUID(), entity: entity.id, values });
  }}>
    <h3 className="font-medium">{record ? t("editRecord") : t("addRecord")} — {entity.name}</h3>
    {entity.fields.map((field) => {
      const id = `${prefix}-${field.id}`;
      const value = record?.values[field.id];
      return <div key={field.id} className="space-y-1">
        <label htmlFor={id} className="block text-sm font-medium">{field.name}{field.required && <span aria-hidden="true"> *</span>}</label>
        {field.type === "boolean" ? <input id={id} name={`field-${field.id}`} type="checkbox" defaultChecked={value === true} disabled={pending} />
          : field.type === "select" ? <select id={id} name={`field-${field.id}`} className={inputClass} defaultValue={typeof value === "string" ? value : ""} required={field.required} disabled={pending}>
            <option value="">{t("selectValue")}</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select> : <input id={id} name={`field-${field.id}`} className={inputClass} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
            defaultValue={typeof value === "string" || typeof value === "number" ? value : ""} required={field.required} disabled={pending}
            maxLength={field.type === "text" ? field.maxLength ?? 10_000 : undefined}
            min={field.type === "number" ? field.min : undefined} max={field.type === "number" ? field.max : undefined} step={field.type === "number" ? "any" : undefined} />}
      </div>;
    })}
    <div className="flex flex-wrap gap-2"><Button disabled={pending} type="submit">{pending ? t("saving") : t("save")}</Button><Button type="reset" variant="outline" disabled={pending} onClick={onCancel}>{t("cancel")}</Button></div>
  </form>;
}

function PackagePanel({ projectId, initial, canManage }: { projectId: string; initial: InstalledModule; canManage: boolean }) {
  const t = useTranslations("moduleRuntime");
  const [records, setRecords] = useState(initial.records);
  const [revision, setRevision] = useState(initial.revision);
  const [viewId, setViewId] = useState(initial.settings.defaultView ?? initial.manifest.views.find((view) => view.type === "table")?.id ?? initial.manifest.views[0]?.id ?? "");
  const [editing, setEditing] = useState<ModuleRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const viewSelectId = useId();
  const manifest = initial.manifest;
  const view = manifest.views.find((candidate) => candidate.id === viewId);
  const entity = manifest.entities.find((candidate) => candidate.id === view?.entity);
  const supported = unsupportedModulePermissions(manifest).length === 0;
  const canRead = supported && initial.installed && initial.enabled && manifest.permissions.includes("module-data:read");
  const canWrite = canManage && canRead && manifest.permissions.includes("module-data:write");

  function save(next: ModuleRecord[]) {
    try { parseModuleRecords(manifest, next); } catch { setStatus(t("invalid")); return; }
    startTransition(async () => {
      try {
        const result = await saveModuleRecords(projectId, initial.moduleId, next, revision);
        if (result.error) setStatus(t(result.error));
        else { setRecords(next); setRevision(result.revision); setEditing(null); setShowForm(false); setStatus(t("saved")); }
      } catch { setStatus(t("saveFailed")); }
    });
  }
  return <Card id={`module-${manifest.id}`} className="min-w-0 scroll-mt-20">
    <CardHeader><CardTitle className="break-words">{manifest.name}</CardTitle><CardDescription>{manifest.author.name} · v{manifest.version}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {canManage && <Link href={`/projects/${projectId}/modules/${initial.moduleId}`} className="inline-block text-sm text-primary underline">{t("manage")}</Link>}
      {!canRead ? <p className="text-sm text-muted-foreground">{!initial.installed ? t("uninstalled") : initial.enabled ? t("noDataPermission") : t("disabled")}</p> : <>
        {view && <div className="flex flex-wrap items-end gap-3"><label htmlFor={viewSelectId} className="min-w-0 flex-1 space-y-1"><span className="text-sm">{t("view")}</span>
          <select id={viewSelectId} className={inputClass} value={viewId} disabled={pending} onChange={(event) => { setViewId(event.target.value); setEditing(null); setShowForm(false); setStatus(""); }}>
            {manifest.views.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select></label>
          {canWrite && entity && view.type !== "form" && <Button disabled={pending || records.length >= 1000} onClick={() => { setEditing(null); setShowForm(true); }}>{t("addRecord")}</Button>}
        </div>}
        {view && <ModuleView manifest={manifest} view={view} records={records} labels={{ empty: t("empty"), yes: t("yes"), no: t("no"), ungrouped: t("ungrouped"), unscheduled: t("unscheduled"), edit: t("edit"), remove: t("remove"), actions: t("actions"), count: t("count") }}
          onEdit={canWrite && !pending ? (record) => { setEditing(record); setShowForm(true); } : undefined}
          onRemove={canWrite && !pending ? (record) => { if (window.confirm(t("confirmRemove"))) save(records.filter((candidate) => candidate.id !== record.id)); } : undefined} />}
        {canWrite && entity && (showForm || view?.type === "form") && <RecordForm key={`${entity.id}-${editing?.id ?? "new"}-${revision}`} entity={entity} record={editing} pending={pending}
          onSave={(record) => save(editing ? records.map((candidate) => candidate.id === editing.id ? record : candidate) : [...records, record])}
          onCancel={() => { setEditing(null); setShowForm(false); }} />}
        {!view && <p className="text-sm text-muted-foreground">{t("noViews")}</p>}
      </>}
      <p role="status" className="text-sm">{status}</p>
      {status === t("conflict") && <Button variant="outline" onClick={() => window.location.reload()}>{t("reload")}</Button>}
    </CardContent>
  </Card>;
}

export function DeclarativeModules({ projectId, packages, canManage }: { projectId: string; packages: InstalledModule[]; canManage: boolean }) {
  const t = useTranslations("moduleRuntime");
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [demo, setDemo] = useState(false);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const parsed = useMemo(() => {
    try { return moduleManifestSchema.safeParse(JSON.parse(draft)); } catch { return null; }
  }, [draft]);
  const manifest = parsed?.success ? parsed.data : null;
  const unsupported = manifest ? unsupportedModulePermissions(manifest) : [];
  return <section className="min-w-0 space-y-4">
    <div><h2 className="text-xl font-semibold">{t("title")}</h2><p className="text-sm text-muted-foreground">{t("description")}</p></div>
    {canManage && <Card><CardHeader><CardTitle>{t("importTitle")}</CardTitle><CardDescription>{t("importHint")}</CardDescription></CardHeader><CardContent className="space-y-4">
      <Button variant="outline" disabled={pending} onClick={() => { setDraft(JSON.stringify(example, null, 2)); setDemo(true); setConsent(false); setStatus(""); }}>{t("example")}</Button>
      <label className="block space-y-1"><span className="text-sm font-medium">{t("manifest")}</span><Textarea value={draft} maxLength={200000} rows={8} className="font-mono text-xs" disabled={pending} onChange={(event) => { setDraft(event.target.value); setDemo(false); setConsent(false); }} /></label>
      {draft && !manifest && <p role="alert" className="text-sm text-destructive">{t("invalidManifest")}</p>}
      {manifest && <div className="space-y-2 rounded-md border p-3"><p className="font-medium">{manifest.name} · v{manifest.version}</p><p className="text-sm font-medium">{t("permissions")}</p>
        {manifest.permissions.length ? <ul className="list-inside list-disc text-sm">{manifest.permissions.map((permission) => <li key={permission}>{permission === "module-data:read" ? t("permissionRead") : permission === "module-data:write" ? t("permissionWrite") : permission}</li>)}</ul> : <p className="text-sm">{t("permissionNone")}</p>}
        {unsupported.length > 0 && <p role="alert" className="text-sm text-destructive">{t("unsupported")}</p>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={pending} onChange={(event) => setConsent(event.target.checked)} /><span>{t("consentLabel")}</span></label>
        {demo && <p className="text-sm text-muted-foreground">{t("demoHint")}</p>}
      </div>}
      <Button disabled={pending || !manifest || !consent || unsupported.length > 0 || packages.length >= 20} onClick={() => startTransition(async () => {
        if (!manifest) return;
        try {
          const result = await createModulePackage(projectId, manifest, manifest.permissions, demo ? fixtures : []);
          if (result.error) setStatus(t(result.error));
          else { setDraft(""); setConsent(false); setDemo(false); setStatus(t("installed")); router.refresh(); }
        } catch { setStatus(t("saveFailed")); }
      })}>{pending ? t("saving") : t("install")}</Button><p role="status" className="text-sm">{status}</p>
    </CardContent></Card>}
    {packages.map((entry) => <PackagePanel key={`${entry.moduleId}-${entry.revision}`} projectId={projectId} initial={entry} canManage={canManage} />)}
    {packages.length === 0 && <p className="text-sm text-muted-foreground">{t("emptyModules")}</p>}
  </section>;
}
