"use client";

import { confirmAction } from "@/components/ui/confirm-action";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { moduleManifestSchema, type ModuleManifest } from "@/lib/work/module-manifest";
import { ModuleView } from "@/lib/work/module-view";
import { ModulePage } from "@/lib/work/module-page";
import { MODULE_MANIFEST_BYTE_LIMIT, parseModuleRecords, unsupportedModulePermissions, type InstalledModule, type ModuleRecord } from "@/lib/work/module-records";
import { CUSTOM_MODULE_AI_PROMPT, CUSTOM_MODULE_PRESETS } from "@/lib/work/custom-modules";
import { convertContentModule } from "@/lib/work/module-legacy";
import example from "../../../../../examples/module-manifests/release-planning.json";
import fixtures from "../../../../../examples/module-manifests/release-planning-data.json";
import { createModulePackage, saveModuleRecords } from "./package-actions";

const inputClass = "w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm";

function RecordForm({ entity, record, pending, onSave, onCancel, fields }: {
  entity: ModuleManifest["entities"][number]; record: ModuleRecord | null; pending: boolean;
  onSave: (record: ModuleRecord) => void; onCancel: () => void; fields?: string[];
}) {
  const t = useTranslations("moduleRuntime");
  const prefix = useId();
  // Older manifests can omit required fields; keep them usable without
  // dropping validation. Optional fields follow the form's selected layout.
  const visibleFields = entity.fields.filter(field => !fields || fields.includes(field.id) || field.required);
  return <form className="space-y-4 rounded-lg border bg-muted/20 p-4" onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: ModuleRecord["values"] = {};
    for (const field of visibleFields) {
      const raw = form.get(`field-${field.id}`);
      if (field.type === "boolean") values[field.id] = raw === "on";
      else if (typeof raw === "string" && raw !== "") values[field.id] = field.type === "number" ? Number(raw) : raw;
    }
    onSave({ id: record?.id ?? crypto.randomUUID(), entity: entity.id, values });
  }}>
    <h3 className="font-medium">{record ? t("editRecord") : t("addRecord")} — {entity.name}</h3>
    {visibleFields.map((field) => {
      const id = `${prefix}-${field.id}`;
      const value = record?.values[field.id];
      return <div key={field.id} className="space-y-1">
        <label htmlFor={id} className="block text-sm font-medium">{field.name}{field.required && <span aria-hidden="true"> *</span>}</label>
        {field.type === "boolean" ? <input id={id} name={`field-${field.id}`} type="checkbox" defaultChecked={value === true} disabled={pending} />
          : field.type === "select" ? <select id={id} name={`field-${field.id}`} className={inputClass} defaultValue={typeof value === "string" ? value : ""} required={field.required} disabled={pending}>
            <option value="">{t("selectValue")}</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select> : field.type === "text" && (field.maxLength ?? 10_000) > 300 ? <Textarea id={id} name={`field-${field.id}`} rows={4} defaultValue={typeof value === "string" ? value : ""} required={field.required} disabled={pending} maxLength={field.maxLength ?? 10_000} />
          : <input id={id} name={`field-${field.id}`} className={inputClass} type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "url" ? "url" : "text"}
            defaultValue={typeof value === "string" || typeof value === "number" ? value : ""} required={field.required} disabled={pending}
            maxLength={field.type === "text" ? field.maxLength ?? 10_000 : field.type === "url" ? 2000 : undefined}
            min={field.type === "number" ? field.min : undefined} max={field.type === "number" ? field.max : undefined} step={field.type === "number" ? "any" : undefined} />}
      </div>;
    })}
    <div className="flex flex-wrap gap-2"><Button disabled={pending} type="submit">{pending ? t("saving") : t("save")}</Button><Button type="reset" variant="outline" disabled={pending} onClick={onCancel}>{t("cancel")}</Button></div>
  </form>;
}

export function PackagePanel({ projectId, initial, canManage }: { projectId: string; initial: InstalledModule; canManage: boolean }) {
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
  const entity = view && view.type !== "page" ? manifest.entities.find((candidate) => candidate.id === view.entity) : undefined;
  // Page views edit one block at a time, in place: which block's form is open and for which record.
  const [pageForm, setPageForm] = useState<{ block: number; record: ModuleRecord | null } | null>(null);
  const supported = unsupportedModulePermissions(manifest).length === 0;
  const canRead = supported && initial.installed && initial.enabled && manifest.permissions.includes("module-data:read");
  const canWrite = canManage && canRead && manifest.permissions.includes("module-data:write");

  /** `optimistic`: show the change at once (a checkbox) and put the old state back if the save fails. */
  function save(next: ModuleRecord[], optimistic = false) {
    try { parseModuleRecords(manifest, next); } catch { setStatus(t("invalid")); return; }
    const previous = records;
    if (optimistic) setRecords(next);
    startTransition(async () => {
      try {
        const result = await saveModuleRecords(projectId, initial.moduleId, next, revision);
        if (result.error) { setStatus(t(result.error)); if (optimistic) setRecords(previous); }
        else { setRecords(next); setRevision(result.revision); setEditing(null); setShowForm(false); setPageForm(null); setStatus(t("saved")); }
      } catch { setStatus(t("saveFailed")); if (optimistic) setRecords(previous); }
    });
  }
  // The module's tab already has its name as the page heading.
  return <Card id={`module-${manifest.id}`} className="min-w-0 scroll-mt-20">
    <CardContent className="space-y-4 pt-6">
      <p className="text-xs text-muted-foreground">{manifest.author.name} · v{manifest.version}{canManage && <> · <Link href={`/projects/${projectId}/modules/${initial.moduleId}`} className="text-primary underline">{t("manage")}</Link></>}</p>
      {!canRead ? <p className="text-sm text-muted-foreground">{!initial.installed ? t("uninstalled") : initial.enabled ? t("noDataPermission") : t("disabled")}</p> : <>
        {view && (manifest.views.length > 1 || (canWrite && entity && view.type !== "form")) && <div className="flex flex-wrap items-end gap-3">{manifest.views.length > 1 && <label htmlFor={viewSelectId} className="min-w-0 flex-1 space-y-1"><span className="text-sm">{t("view")}</span>
          <select id={viewSelectId} className={inputClass} value={viewId} disabled={pending} onChange={(event) => { setViewId(event.target.value); setEditing(null); setShowForm(false); setPageForm(null); setStatus(""); }}>
            {manifest.views.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select></label>}
          {canWrite && entity && view.type !== "form" && <Button disabled={pending || records.length >= 1000} onClick={() => { setEditing(null); setShowForm(true); }}>{t("addRecord")}</Button>}
        </div>}
        {view?.type === "page" && <ModulePage view={view} records={records} labels={{ empty: t("empty"), edit: t("edit"), remove: t("remove") }}
          onToggle={canWrite && !pending ? (record, field, checked) => save(records.map((candidate) => candidate.id === record.id ? { ...candidate, values: { ...candidate.values, [field]: checked } } : candidate), true) : undefined}
          onEdit={canWrite && !pending ? (record) => setPageForm({ block: view.blocks.findIndex((block) => block.type !== "text" && block.entity === record.entity), record }) : undefined}
          onRemove={canWrite && !pending ? async (record) => { if (await confirmAction(t("confirmRemove"))) save(records.filter((candidate) => candidate.id !== record.id)); } : undefined}
          renderAdd={canWrite ? (block, index) => {
            const blockEntity = manifest.entities.find((candidate) => candidate.id === block.entity);
            if (!blockEntity) return null;
            if (pageForm?.block !== index) return <Button size="sm" variant="outline" disabled={pending || records.length >= 1000} onClick={() => setPageForm({ block: index, record: null })}>{t("addItem")}</Button>;
            const fields = block.type === "notes" ? [block.field] : block.type === "checklist" ? [block.labelField] : [block.labelField, block.urlField];
            const record = pageForm.record;
            return <RecordForm key={`${index}-${record?.id ?? "new"}-${revision}`} entity={blockEntity} record={record} pending={pending} fields={fields}
              onSave={(next) => save(record ? records.map((candidate) => candidate.id === record.id ? { ...next, values: { ...record.values, ...next.values } } : candidate) : [...records, next])}
              onCancel={() => setPageForm(null)} />;
          } : undefined} />}
        {view && view.type !== "page" && <ModuleView manifest={manifest} view={view} records={records} labels={{ empty: t("empty"), yes: t("yes"), no: t("no"), ungrouped: t("ungrouped"), unscheduled: t("unscheduled"), edit: t("edit"), remove: t("remove"), actions: t("actions"), count: t("count") }}
          onEdit={canWrite && !pending ? (record) => { setEditing(record); setShowForm(true); } : undefined}
          onRemove={canWrite && !pending ? async (record) => { if (await confirmAction(t("confirmRemove"))) save(records.filter((candidate) => candidate.id !== record.id)); } : undefined} />}
        {canWrite && entity && (showForm || view?.type === "form") && <RecordForm key={`${entity.id}-${editing?.id ?? "new"}-${revision}`} entity={entity} record={editing} pending={pending} fields={view?.type === "form" ? view.fields : undefined}
          onSave={(record) => save(editing ? records.map((candidate) => candidate.id === editing.id ? record : candidate) : [...records, record])}
          onCancel={() => { setEditing(null); setShowForm(false); }} />}
        {!view && <p className="text-sm text-muted-foreground">{t("noViews")}</p>}
      </>}
      <p role="status" className="text-sm">{status}</p>
      {status === t("conflict") && <Button variant="outline" onClick={() => window.location.reload()}>{t("reload")}</Button>}
    </CardContent>
  </Card>;
}

type Candidate = { manifest: ModuleManifest; records: ModuleRecord[] };

/** A pasted/imported file: a module manifest, a module export, or a content module (the pre-092 format and the AI prompt's) converted to a page module. */
function readCandidate(text: string): Candidate | null {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return null; }
  const manifest = moduleManifestSchema.safeParse(json);
  if (manifest.success) return { manifest: manifest.data, records: [] };
  // A module's own export (Configuration → Export): manifest plus its entries.
  if (json && typeof json === "object" && (json as { exportVersion?: unknown }).exportVersion === 1) {
    const exported = json as { manifest?: unknown; records?: unknown };
    const parsed = moduleManifestSchema.safeParse(exported.manifest);
    if (!parsed.success) return null;
    try { return { manifest: parsed.data, records: parseModuleRecords(parsed.data, exported.records ?? []) }; } catch { return null; }
  }
  try { const converted = convertContentModule(json); return { manifest: converted.manifest, records: converted.records }; } catch { return null; }
}

/** A template is a fresh copy: its own id, so the same template can be added twice. */
function templateCandidate(template: "release" | "research" | "planning"): Candidate {
  if (template === "planning") return { manifest: moduleManifestSchema.parse(example), records: parseModuleRecords(moduleManifestSchema.parse(example), fixtures) };
  const preset = CUSTOM_MODULE_PRESETS.find((candidate) => candidate.id === template)!;
  const converted = convertContentModule(preset, `${preset.id}-${crypto.randomUUID().slice(0, 8)}`);
  return { manifest: converted.manifest, records: converted.records };
}

/**
 * The Modules page: every installed module (each also has its own tab in
 * the project sidebar) plus adding one - from a template, a JSON file or a
 * pasted manifest. The Marketplace and the AI builder are the other ways in.
 */
export function DeclarativeModules({ projectId, packages, canManage }: { projectId: string; packages: InstalledModule[]; canManage: boolean }) {
  const t = useTranslations("moduleRuntime");
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [template, setTemplate] = useState<Candidate | null>(null);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const candidate = useMemo(() => template ?? (draft ? readCandidate(draft) : null), [draft, template]);
  const manifest = candidate?.manifest ?? null;
  const unsupported = manifest ? unsupportedModulePermissions(manifest) : [];
  const installedCount = packages.filter((entry) => entry.installed).length;
  const pick = (next: Candidate) => { setTemplate(next); setDraft(JSON.stringify(next.manifest, null, 2)); setConsent(false); setStatus(""); };
  return <section className="min-w-0 space-y-4">
    {canManage && <Card><CardHeader><CardTitle>{t("addTitle")}</CardTitle><CardDescription>{t("addHint")}</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => pick(templateCandidate("release"))}>{t("templateRelease")}</Button>
        <Button variant="outline" disabled={pending} onClick={() => pick(templateCandidate("research"))}>{t("templateResearch")}</Button>
        <Button variant="outline" disabled={pending} onClick={() => pick(templateCandidate("planning"))}>{t("example")}</Button>
        <Button variant="outline" asChild><Link href="/marketplace">{t("browseMarketplace")}</Link></Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => file.current?.click()}>{t("importFile")}</Button>
        <Button variant="outline" disabled={pending} onClick={async () => { try { await navigator.clipboard.writeText(CUSTOM_MODULE_AI_PROMPT); setStatus(t("promptCopied")); } catch { setStatus(t("copyFailed")); } }}>{t("copyPrompt")}</Button>
      </div>
      <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={async (event) => {
        const chosen = event.target.files?.[0]; event.target.value = "";
        if (!chosen) return;
        if (chosen.size > MODULE_MANIFEST_BYTE_LIMIT) { setStatus(t("invalidManifest")); return; }
        setTemplate(null); setDraft(await chosen.text()); setConsent(false); setStatus("");
      }} />
      <label className="block space-y-1"><span className="text-sm font-medium">{t("manifest")}</span><Textarea value={draft} maxLength={MODULE_MANIFEST_BYTE_LIMIT} rows={8} className="font-mono text-xs" disabled={pending} placeholder={t("manifestHint")} onChange={(event) => { setDraft(event.target.value); setTemplate(null); setConsent(false); }} /></label>
      {draft && !manifest && <p role="alert" className="text-sm text-destructive">{t("invalidManifest")}</p>}
      {manifest && <div className="space-y-2 rounded-md border p-3"><p className="font-medium">{manifest.name} · v{manifest.version}</p>{manifest.description && <p className="text-sm text-muted-foreground">{manifest.description}</p>}<p className="text-sm font-medium">{t("permissions")}</p>
        {manifest.permissions.length ? <ul className="list-inside list-disc text-sm">{manifest.permissions.map((permission) => <li key={permission}>{permission === "module-data:read" ? t("permissionRead") : permission === "module-data:write" ? t("permissionWrite") : permission}</li>)}</ul> : <p className="text-sm">{t("permissionNone")}</p>}
        {unsupported.length > 0 && <p role="alert" className="text-sm text-destructive">{t("unsupported")}</p>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={pending} onChange={(event) => setConsent(event.target.checked)} /><span>{t("consentLabel")}</span></label>
        {candidate && candidate.records.length > 0 && <p className="text-sm text-muted-foreground">{t("startsWith", { count: candidate.records.length })}</p>}
      </div>}
      <Button disabled={pending || !candidate || !consent || unsupported.length > 0 || installedCount >= 20} onClick={() => startTransition(async () => {
        if (!candidate) return;
        try {
          const result = await createModulePackage(projectId, candidate.manifest, candidate.manifest.permissions, candidate.records);
          if (result.error) setStatus(t(result.error));
          else {
            setDraft(""); setTemplate(null); setConsent(false); setStatus(t("installed"));
            router.push(candidate.manifest.permissions.includes("module-data:read") ? `/projects/${projectId}/extensions/package/${candidate.manifest.id}` : `/projects/${projectId}/modules`);
            router.refresh();
          }
        } catch { setStatus(t("saveFailed")); }
      })}>{pending ? t("saving") : t("install")}</Button>
      {installedCount >= 20 && <p className="text-sm text-muted-foreground">{t("limitReached")}</p>}
      <p role="status" className="text-sm">{status}</p>
    </CardContent></Card>}
    <div><h2 className="text-xl font-semibold">{t("installedTitle")}</h2><p className="text-sm text-muted-foreground">{t("installedHint")}</p></div>
    {packages.length === 0 ? <p className="text-sm text-muted-foreground">{t("emptyModules")}</p> : <ul className="grid min-w-0 gap-3 md:grid-cols-2">
      {packages.map((entry) => {
        const readable = entry.installed && entry.enabled && entry.manifest.permissions.includes("module-data:read") && unsupportedModulePermissions(entry.manifest).length === 0;
        return <li key={entry.moduleId} id={`module-${entry.moduleId}`} className="min-w-0 scroll-mt-20 space-y-2 rounded-lg border bg-card p-4">
          <div className="min-w-0"><h3 className="break-words font-semibold">{entry.manifest.name}</h3><p className="text-xs text-muted-foreground">{entry.manifest.author.name} · v{entry.manifest.version} · {!entry.installed ? t("uninstalled") : entry.enabled ? t("enabledState") : t("disabled")}{entry.settings.category ? ` · ${entry.settings.category}` : ""}</p></div>
          {entry.manifest.description && <p className="break-words text-sm text-muted-foreground">{entry.manifest.description}</p>}
          <div className="flex flex-wrap gap-3 text-sm">
            {readable && <Link href={`/projects/${projectId}/extensions/package/${entry.moduleId}`} className="text-primary underline">{t("open")}</Link>}
            {canManage && <Link href={`/projects/${projectId}/modules/${entry.moduleId}`} className="text-primary underline">{t("manage")}</Link>}
          </div>
        </li>;
      })}
    </ul>}
  </section>;
}
