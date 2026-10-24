import { createElement as h, type ReactNode } from "react";
import type { ModuleManifest } from "./module-manifest";
import type { ModuleRecord } from "./module-records";

type Labels = { empty: string; yes: string; no: string; ungrouped: string; unscheduled: string; edit: string; remove: string; actions: string; count: string };
type Props = {
  manifest: ModuleManifest;
  view: ModuleManifest["views"][number];
  records: ModuleRecord[];
  labels: Labels;
  onEdit?: (record: ModuleRecord) => void;
  onRemove?: (record: ModuleRecord) => void;
};

/** Only fixed React elements; module labels and values are always text children. */
export function ModuleView({ manifest, view, records, labels, onEdit, onRemove }: Props): ReactNode {
  const entity = manifest.entities.find((candidate) => candidate.id === view.entity);
  if (!entity || view.type === "form") return null;
  const fields = view.fields.map((id) => entity.fields.find((field) => field.id === id)!);
  const rows = records.filter((record) => record.entity === entity.id);
  const readValue = (record: ModuleRecord, id: string) => Object.hasOwn(record.values, id) ? record.values[id] : undefined;
  const value = (record: ModuleRecord, field: typeof fields[number]) => {
    const raw = Object.hasOwn(record.values, field.id) ? record.values[field.id] : null;
    if (raw === undefined || raw === null || raw === "") return "—";
    if (field.type === "select") return field.options.find((option) => option.value === raw)?.label ?? "—";
    if (typeof raw === "boolean") return raw ? labels.yes : labels.no;
    return String(raw);
  };
  const actions = (record: ModuleRecord) => h("div", { className: "flex flex-wrap gap-2" },
    onEdit && h("button", { type: "button", className: "text-sm text-primary underline", onClick: () => onEdit(record) }, labels.edit),
    onRemove && h("button", { type: "button", className: "text-sm text-destructive underline", onClick: () => onRemove(record) }, labels.remove),
  );
  const card = (record: ModuleRecord) => h("li", { key: record.id, className: "space-y-2 rounded-md border bg-card p-3" },
    ...fields.map((field) => h("p", { key: field.id, className: "break-words text-sm" }, h("span", { className: "text-muted-foreground" }, `${field.name}: `), value(record, field))),
    actions(record),
  );
  if (!rows.length) return h("p", { className: "text-sm text-muted-foreground" }, labels.empty);
  if (view.type === "table") {
    return h("div", { className: "max-w-full overflow-x-auto" }, h("table", { className: "w-full text-left text-sm" },
      h("caption", { className: "sr-only" }, view.name),
      h("thead", null, h("tr", null, ...fields.map((field) => h("th", { key: field.id, scope: "col", className: "border-b p-2" }, field.name)), (onEdit || onRemove) && h("th", { scope: "col", className: "border-b p-2" }, labels.actions))),
      h("tbody", null, ...rows.map((record) => h("tr", { key: record.id }, ...fields.map((field) => h("td", { key: field.id, className: "max-w-80 whitespace-pre-wrap break-words border-b p-2" }, value(record, field))), (onEdit || onRemove) && h("td", { className: "border-b p-2" }, actions(record))))),
    ));
  }
  if (view.type === "calendar") {
    const dates = [...new Set(rows.map((record) => String(readValue(record, view.dateField) ?? "")))].sort();
    return h("div", { className: "space-y-4" }, ...dates.map((date) => h("section", { key: date || "unscheduled", className: "space-y-2" },
      h("h3", { className: "font-medium" }, date ? h("time", { dateTime: date }, date) : labels.unscheduled),
      h("ul", { className: "grid gap-2 sm:grid-cols-2" }, ...rows.filter((record) => String(readValue(record, view.dateField) ?? "") === date).map(card)),
    )));
  }
  const groupBy = view.groupBy ?? entity.fields.find((field) => field.type === "select" && view.fields.includes(field.id))?.id;
  const groupField = entity.fields.find((field) => field.id === groupBy);
  if (!groupField || groupField.type !== "select") return null;
  const groups = [...groupField.options, { value: "", label: labels.ungrouped }];
  if (view.type === "chart") {
    return h("figure", { className: "space-y-3" }, h("figcaption", { className: "sr-only" }, `${view.name}: ${labels.count}`), ...groups.map((group) => {
      const count = rows.filter((record) => (readValue(record, groupField.id) ?? "") === group.value).length;
      return h("div", { key: group.value, className: "grid grid-cols-[minmax(0,1fr)_3fr_auto] items-center gap-3 text-sm" },
        h("span", { className: "break-words" }, group.label),
        h("div", { className: "h-4 overflow-hidden rounded bg-muted", "aria-hidden": true }, h("div", { className: "h-full rounded bg-primary", style: { width: `${count / rows.length * 100}%` } })),
        h("span", null, String(count)),
      );
    }));
  }
  return h("div", { className: "grid gap-3 md:grid-cols-2 xl:grid-cols-3" }, ...groups.map((group) => h("section", { key: group.value, className: "min-w-0 space-y-2 rounded-md bg-muted/40 p-3" },
    h("h3", { className: "break-words text-sm font-semibold" }, group.label),
    h("ul", { className: "space-y-2" }, ...rows.filter((record) => (readValue(record, groupField.id) ?? "") === group.value).map(card)),
  )));
}
