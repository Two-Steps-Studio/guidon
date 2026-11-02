import assert from "node:assert/strict";
import { createJiti } from "jiti";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The component is TSX with the classic JSX runtime; jiti compiles it in-process.
globalThis.React = React;
const { MarkdownPreview } = await createJiti(import.meta.url, { jsx: true, alias: { "@": new URL("../src", import.meta.url).pathname } }).import("../src/components/files/markdown-preview.tsx");
const render = (content) => renderToStaticMarkup(React.createElement(MarkdownPreview, { content }));

// Untrusted description: raw HTML stays text, script URLs are dropped.
const hostile = render([
  "<script>window.x=1</script> <img src=x onerror=\"window.x=1\"> <iframe src=\"https://evil.test\"></iframe>",
  "[js](javascript:alert(1)) [data](data:text/html,<script>alert(1)</script>) [vb](vbscript:msgbox)",
].join("\n\n"));
assert.doesNotMatch(hostile, /<(script|iframe|img)\b|<[^>]*\son\w+=/i, "Raw HTML must never become markup or an event handler");
assert.doesNotMatch(hostile, /href="(javascript|data|vbscript):/i, "Script URLs must be dropped");
assert.match(hostile, /&lt;script&gt;/, "Raw HTML is shown as text");

// Links open in a new tab that can't reach back; no react-markdown internals leak into attributes.
const links = render("[site](https://example.com) and <https://auto.example.com>");
for (const href of ["https://example.com", "https://auto.example.com"]) {
  assert.match(links, new RegExp(`<a[^>]*href="${href}"[^>]*>`));
}
assert.equal((links.match(/target="_blank"/g) ?? []).length, 2);
assert.equal((links.match(/rel="noopener noreferrer nofollow"/g) ?? []).length, 2);
assert.doesNotMatch(render("# T\n\n- a\n\n`x`"), /node="/, "The AST node is not an HTML attribute");

// Lists, checklists and code read as such.
const rich = render("- one\n- two\n\n1. first\n\n- [x] done\n- [ ] todo\n\n`inline`\n\n```\nplain block\n```\n\n```ts\nconst a = 1\n```");
assert.match(rich, /<ul[^>]*>\s*<li[^>]*>one<\/li>/);
assert.match(rich, /<ol[^>]*>\s*<li[^>]*>first<\/li>/);
assert.match(rich, /<input[^>]*type="checkbox"[^>]*checked/);
assert.equal((rich.match(/<pre[^>]*overflow-x-auto/g) ?? []).length, 2, "Every fenced block scrolls inside its own box, with or without a language");
assert.match(rich, /<code class="[^"]*rounded bg-muted[^"]*">inline<\/code>/);

console.log("pass task description markdown: no raw HTML or script URLs, safe external links, lists/checklists/code blocks");
