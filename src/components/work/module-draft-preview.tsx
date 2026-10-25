import { ModuleView } from "@/lib/work/module-view";
import type { ModuleManifest } from "@/lib/work/module-manifest";
import { modulePreviewRecords } from "@/lib/work/module-preview";

export function ModuleDraftPreview({ manifest, viewId, onView, labels }: {
  manifest: ModuleManifest; viewId: string; onView: (id: string) => void;
  labels: { view: string; empty: string; yes: string; no: string; ungrouped: string; unscheduled: string; edit: string; remove: string; actions: string; count: string };
}) {
  const view = manifest.views.find((candidate) => candidate.id === viewId) ?? manifest.views[0];
  const entity = manifest.entities.find((candidate) => candidate.id === view?.entity);
  return <div className="min-w-0 space-y-4">
    <label className="block space-y-1 text-sm">{labels.view}<select aria-label={labels.view} className="w-full rounded border bg-background p-2" value={view?.id ?? ""} onChange={(event) => onView(event.target.value)}>{manifest.views.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
    <div className="overflow-x-auto">{view?.type === "form" ? <div className="space-y-3">{entity?.fields.filter(field => view.fields.includes(field.id) || field.required).map((field) => <label key={field.id} className="block space-y-1 text-sm"><span>{field.name}{field.required ? " *" : ""}</span>{field.type === "select" ? <select disabled className="w-full rounded border bg-background p-2">{field.options.map((option) => <option key={option.value}>{option.label}</option>)}</select> : <input disabled type={field.type === "boolean" ? "checkbox" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} className="max-w-full rounded border bg-background p-2" />}</label>)}</div> : view && <ModuleView manifest={manifest} view={view} records={modulePreviewRecords(manifest)} labels={labels} />}</div>
  </div>;
}
