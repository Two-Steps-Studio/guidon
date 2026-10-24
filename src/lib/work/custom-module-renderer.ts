import { createElement as h, type ReactNode } from "react";
import type { CustomModule } from "./custom-modules";

export function renderCustomModuleBlocks(
  module: CustomModule,
  moduleIndex: number,
  canManage: boolean,
  pending: boolean,
  onChecklistToggle: (moduleIndex: number, blockIndex: number, itemIndex: number, checked: boolean) => void,
): ReactNode {
  return module.blocks.map((block, blockIndex) => {
    let content: ReactNode;
    if (block.type === "text") {
      content = h("p", { className: "whitespace-pre-wrap text-sm" }, block.text);
    } else if (block.type === "links") {
      content = h("ul", { className: "space-y-1 text-sm" }, block.items.map((item, index) => h(
        "li",
        { key: index },
        h("a", { className: "text-primary underline", href: item.url, target: "_blank", rel: "noopener noreferrer" }, item.label),
      )));
    } else {
      content = h("ul", { className: "space-y-2" }, block.items.map((item, index) => h(
        "li",
        { key: index },
        h("label", { className: "flex items-start gap-2 text-sm" },
          h("input", {
            type: "checkbox",
            checked: item.done,
            disabled: !canManage || pending,
            onChange: (event: { target: { checked: boolean } }) => onChecklistToggle(moduleIndex, blockIndex, index, event.target.checked),
          }),
          h("span", { className: item.done ? "line-through text-muted-foreground" : "" }, item.label),
        ),
      )));
    }

    return h(
      "section",
      { key: blockIndex, className: "space-y-2 break-words" },
      h("h2", { className: "text-sm font-semibold" }, block.title),
      content,
    );
  });
}
