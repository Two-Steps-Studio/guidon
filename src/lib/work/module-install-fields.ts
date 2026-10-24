import { createElement as h } from "react";

export function ModuleInstallFields({ projects, permissions, digest, labels }: {
  projects: { id: string; name: string }[]; permissions: readonly string[]; digest: string;
  labels: { project: string; chooseProject: string; consent: string; install: string };
}) {
  return h("div", { className: "space-y-4" },
    h("input", { type: "hidden", name: "digest", value: digest }),
    ...permissions.map((permission) => h("input", { key: permission, type: "hidden", name: "permissions", value: permission })),
    h("div", { className: "space-y-1" }, h("label", { className: "block text-sm font-medium", htmlFor: "install-project" }, labels.project),
      h("select", { id: "install-project", name: "projectId", required: true, defaultValue: "", className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm" }, h("option", { value: "" }, labels.chooseProject), ...projects.map((project) => h("option", { key: project.id, value: project.id }, project.name)))),
    h("label", { className: "flex items-start gap-2 text-sm" }, h("input", { name: "approve", type: "checkbox", required: true }), h("span", null, labels.consent)),
    h("button", { type: "submit", className: "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" }, labels.install),
  );
}
