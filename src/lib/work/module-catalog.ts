import { createElement as h, type ReactNode } from "react";

export type CatalogCard = {
  moduleId: string;
  version: string;
  name: string;
  author: string;
  description: string;
  category: "planning" | "research" | "operations";
  compatible: boolean;
};
export type CatalogFilters = { q: string; category: string; compatibility: string };
export type CatalogLabels = {
  title: string; description: string; search: string; category: string; all: string;
  planning: string; research: string; operations: string; compatibility: string;
  compatible: string; incompatible: string; empty: string; details: string; myModules: string;
};

export function ModulePermissionList({ permissions, labels }: { permissions: readonly string[]; labels: { read: string; write: string; none: string } }): ReactNode {
  return permissions.length ? h("ul", { className: "list-inside list-disc text-sm" }, ...permissions.map((permission) => h("li", { key: permission }, permission === "module-data:read" ? labels.read : permission === "module-data:write" ? labels.write : permission))) : h("p", null, labels.none);
}

export function filterModuleCatalog(items: CatalogCard[], filters: CatalogFilters): CatalogCard[] {
  const query = filters.q.trim().slice(0, 100).toLocaleLowerCase();
  return items.filter((item) => (!query || `${item.name} ${item.description} ${item.author}`.toLocaleLowerCase().includes(query))
    && (!filters.category || item.category === filters.category)
    && (!filters.compatibility || (filters.compatibility === "compatible" ? item.compatible : !item.compatible)));
}

/** GET forms keep filters linkable and work before JavaScript loads. */
export function ModuleCatalogScreen({ items, filters, labels }: { items: CatalogCard[]; filters: CatalogFilters; labels: CatalogLabels }): ReactNode {
  const found = filterModuleCatalog(items, filters);
  const inputClass = "w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm";
  const field = (name: string, title: string, child: ReactNode) => h("div", { className: "min-w-0 space-y-1" }, h("label", { className: "text-sm font-medium", htmlFor: `catalog-${name}` }, title), child);
  return h("div", { className: "mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6" },
    h("div", { className: "flex flex-wrap items-start justify-between gap-4" },
      h("div", null, h("h1", { className: "text-2xl font-semibold" }, labels.title), h("p", { className: "text-muted-foreground" }, labels.description)),
      h("a", { href: "/my-modules", className: "rounded-md border px-4 py-2 text-sm text-primary" }, labels.myModules),
    ),
    h("form", { action: "/marketplace", method: "get", className: "grid min-w-0 items-end gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]", role: "search" },
      field("q", labels.search, h("input", { id: "catalog-q", name: "q", type: "search", maxLength: 100, defaultValue: filters.q, className: inputClass })),
      field("category", labels.category, h("select", { id: "catalog-category", name: "category", defaultValue: filters.category, className: inputClass }, h("option", { value: "" }, labels.all), ...["planning", "research", "operations"].map((category) => h("option", { key: category, value: category }, labels[category as keyof CatalogLabels])))),
      field("compatibility", labels.compatibility, h("select", { id: "catalog-compatibility", name: "compatibility", defaultValue: filters.compatibility, className: inputClass }, h("option", { value: "" }, labels.all), h("option", { value: "compatible" }, labels.compatible), h("option", { value: "incompatible" }, labels.incompatible))),
      h("button", { type: "submit", className: "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" }, labels.search),
    ),
    !found.length ? h("p", { role: "status", className: "py-12 text-center text-muted-foreground" }, labels.empty)
      : h("div", { className: "grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3" }, ...found.map((item) => h("article", { key: `${item.moduleId}-${item.version}`, className: "min-w-0 space-y-3 rounded-lg border bg-card p-5" },
        h("h2", { className: "break-words text-lg font-semibold" }, item.name),
        h("p", { className: "break-words text-sm text-muted-foreground" }, `${item.author} · v${item.version}`),
        h("p", { className: "break-words text-sm" }, item.description),
        h("div", { className: "flex flex-wrap gap-2 text-xs" }, h("span", { className: "rounded bg-muted px-2 py-1" }, labels[item.category]), h("span", { className: "rounded bg-muted px-2 py-1" }, item.compatible ? labels.compatible : labels.incompatible)),
        h("a", { href: `/marketplace/${encodeURIComponent(item.moduleId)}/${encodeURIComponent(item.version)}`, className: "inline-block text-sm text-primary underline" }, labels.details),
      ))),
  );
}
