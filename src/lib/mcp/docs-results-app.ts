/**
 * MCP Apps view for the docs server's search_docs (src/app/api/mcp/docs):
 * hosts that support MCP Apps (Claude, ChatGPT and others) render this
 * instead of the plain-text result. No libraries and nothing loaded from
 * outside: it speaks the MCP Apps postMessage protocol by hand - ui/initialize,
 * then tool-input/tool-result notifications - and opens links through the
 * host (ui/open-link), since the sandboxed frame can't navigate itself.
 * Everything from the result is set with textContent, never as HTML.
 */

import { BRAND_COLORS } from "@/lib/brand-colors";

export const DOCS_RESULTS_URI = "ui://guidon/docs-results";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

export const DOCS_RESULTS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Guidon docs</title>
<style>
  :root { color-scheme: light dark; --fg: #1a1a1a; --muted: #666; --line: #e3e3e3; --accent: ${BRAND_COLORS.blue}; --bg: transparent; }
  :root[data-theme="dark"] { --fg: #ececec; --muted: #a0a0a0; --line: #333; --accent: ${BRAND_COLORS.electricBlue}; }
  body { margin: 0; padding: 12px 14px; font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg); }
  h1 { font-size: 13px; font-weight: 600; color: var(--muted); margin: 0 0 8px; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { padding: 10px 0; border-top: 1px solid var(--line); }
  li:first-child { border-top: 0; }
  a { color: var(--accent); font-weight: 600; text-decoration: none; cursor: pointer; }
  a:hover { text-decoration: underline; }
  .url { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
  .snippet { margin: 4px 0 0; }
  .empty { color: var(--muted); }
</style>
</head>
<body>
<h1 id="heading">Guidon docs</h1>
<ol id="results"><li class="empty">Searching...</li></ol>
<script>
(() => {
  let nextId = 1;
  const pending = new Map();
  const send = (message) => window.parent.postMessage({ jsonrpc: "2.0", ...message }, "*");
  const request = (method, params) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    send({ id, method, params });
  });
  const notify = (method, params) => send({ method, params });

  const applyTheme = (context) => {
    if (context && context.theme) document.documentElement.dataset.theme = context.theme;
  };
  const reportSize = () => notify("ui/notifications/size-changed", { height: document.documentElement.scrollHeight });

  function render(query, results) {
    const list = document.getElementById("results");
    list.replaceChildren();
    document.getElementById("heading").textContent = query ? "Guidon docs: " + query : "Guidon docs";
    if (!results.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No matching documentation.";
      list.append(li);
    }
    for (const item of results) {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.textContent = item.title;
      link.href = item.url;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        request("ui/open-link", { url: item.url });
      });
      const url = document.createElement("div");
      url.className = "url";
      url.textContent = item.url;
      const snippet = document.createElement("p");
      snippet.className = "snippet";
      snippet.textContent = item.snippet;
      li.append(link, url, snippet);
      list.append(li);
    }
    reportSize();
  }

  let query = "";
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message.result);
      pending.delete(message.id);
      return;
    }
    if (message.method === "ui/notifications/tool-input") {
      query = (message.params && message.params.arguments && message.params.arguments.query) || "";
    } else if (message.method === "ui/notifications/tool-result") {
      const data = (message.params && message.params.structuredContent) || {};
      render(query, Array.isArray(data.items) ? data.items : []);
    } else if (message.method === "ui/notifications/host-context-changed") {
      applyTheme(message.params);
    }
  });

  request("ui/initialize", {
    protocolVersion: "2026-01-26",
    appInfo: { name: "guidon-docs-results", version: "1.0.0" },
    appCapabilities: {},
  }).then((result) => {
    applyTheme(result && result.hostContext);
    notify("ui/notifications/initialized", {});
    reportSize();
  });
})();
</script>
</body>
</html>
`;
