import { createElement as h, type ReactNode } from "react";
import type { ModuleManifest, ModulePageBlock } from "./module-manifest";
import { isModuleUrl, type ModuleRecord } from "./module-records";

type PageView = Extract<ModuleManifest["views"][number], { type: "page" }>;
type DataBlock = Exclude<ModulePageBlock, { type: "text" }>;

export type ModulePageLabels = { empty: string; remove: string; edit: string };

type Props = {
  view: PageView;
  records: ModuleRecord[];
  labels: ModulePageLabels;
  /** Absent when the viewer cannot write: checkboxes are disabled and no controls render. */
  onToggle?: (record: ModuleRecord, field: string, checked: boolean) => void;
  onEdit?: (record: ModuleRecord, block: DataBlock) => void;
  onRemove?: (record: ModuleRecord) => void;
  /** Slot under each data block for the caller's add form. */
  renderAdd?: (block: DataBlock, index: number) => ReactNode;
};

const text = (record: ModuleRecord, field: string) => {
  const value = Object.hasOwn(record.values, field) ? record.values[field] : null;
  return typeof value === "string" ? value : "";
};

/**
 * A page view: the author's fixed text plus notes, checklists and link lists,
 * each the records of one entity. Same rules as ModuleView - fixed elements
 * only, module strings are text children and only validated http(s) hrefs.
 */
export function ModulePage({ view, records, labels, onToggle, onEdit, onRemove, renderAdd }: Props): ReactNode {
  // Each record repeats Edit/Remove, so the accessible name says which one.
  const controls = (record: ModuleRecord, block: DataBlock, name: string) => (onEdit || onRemove) && h("span", { className: "ml-2 inline-flex gap-2" },
    onEdit && h("button", { type: "button", className: "text-xs text-primary underline", "aria-label": `${labels.edit}: ${name.slice(0, 80)}`, onClick: () => onEdit(record, block) }, labels.edit),
    onRemove && h("button", { type: "button", className: "text-xs text-destructive underline", "aria-label": `${labels.remove}: ${name.slice(0, 80)}`, onClick: () => onRemove(record) }, labels.remove),
  );
  return h("div", { className: "space-y-6" }, ...view.blocks.map((block, index) => {
    let content: ReactNode;
    if (block.type === "text") {
      content = h("p", { className: "whitespace-pre-wrap text-sm" }, block.text);
    } else {
      const rows = records.filter((record) => record.entity === block.entity);
      if (!rows.length) content = h("p", { className: "text-sm text-muted-foreground" }, labels.empty);
      else if (block.type === "notes") {
        content = h("div", { className: "space-y-3" }, ...rows.map((record) => h("div", { key: record.id, className: "space-y-1" },
          h("p", { className: "whitespace-pre-wrap text-sm" }, text(record, block.field)),
          controls(record, block, text(record, block.field)),
        )));
      } else if (block.type === "links") {
        content = h("ul", { className: "space-y-1 text-sm" }, ...rows.map((record) => {
          const url = text(record, block.urlField);
          const label = text(record, block.labelField) || url;
          return h("li", { key: record.id, className: "break-words" },
            isModuleUrl(url) ? h("a", { className: "text-primary underline", href: url, target: "_blank", rel: "noopener noreferrer" }, label) : h("span", null, label),
            controls(record, block, label),
          );
        }));
      } else {
        content = h("ul", { className: "space-y-2" }, ...rows.map((record) => {
          const done = record.values[block.doneField] === true;
          return h("li", { key: record.id, className: "flex flex-wrap items-start gap-x-2" },
            h("label", { className: "flex min-w-0 items-start gap-2 text-sm" },
              h("input", {
                type: "checkbox",
                className: "mt-0.5",
                checked: done,
                disabled: !onToggle,
                onChange: (event: { target: { checked: boolean } }) => onToggle?.(record, block.doneField, event.target.checked),
              }),
              h("span", { className: done ? "break-words line-through text-muted-foreground" : "break-words" }, text(record, block.labelField)),
            ),
            controls(record, block, text(record, block.labelField)),
          );
        }));
      }
    }
    return h("section", { key: index, className: "min-w-0 space-y-2 break-words" },
      h("h2", { className: "text-sm font-semibold" }, block.title),
      content,
      block.type !== "text" && renderAdd ? renderAdd(block, index) : null,
    );
  }));
}
