// @ts-check
// The moodboard webview. The extension lists the images and downloads them;
// this file only renders `state`/`image` messages and posts actions back.
(function () {
  const vscode = acquireVsCodeApi();
  /** @type {any} */ let state = null;
  /** @type {Record<string, string|null>} image id -> data: URI (null = failed) */
  const images = {};
  let tag = "";
  let query = "";
  let openId = "";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const post = (type, data = {}) => vscode.postMessage({ type, ...data });
  const app = /** @type {HTMLElement} */ (document.getElementById("app"));

  function visibleItems() {
    const q = query.trim().toLowerCase();
    return state.items.filter(
      (item) =>
        (!tag || item.tags.includes(tag)) &&
        (!q || `${item.caption ?? ""} ${item.name} ${item.tags.join(" ")}`.toLowerCase().includes(q))
    );
  }

  function thumb(id, alt) {
    if (!(id in images)) return `<div class="mb-placeholder muted small">Loading…</div>`;
    if (!images[id]) return `<div class="mb-placeholder muted small">Image unavailable</div>`;
    return `<img src="${images[id]}" alt="${esc(alt)}" loading="lazy">`;
  }

  function lightbox() {
    const item = state.items.find((i) => i.id === openId);
    if (!item) return "";
    const tags = item.tags.map((t) => `<span class="mb-tag">${esc(t)}</span>`).join("");
    const image = images[item.id]
      ? `<img src="${images[item.id]}" alt="${esc(item.caption || item.name)}">`
      : `<div class="mb-placeholder muted">Image unavailable</div>`;
    const source = item.source_url
      ? `<button class="btn" data-action="source" data-url="${esc(item.source_url)}">Open source</button>`
      : "";
    return `<div class="mb-lightbox" data-action="close">
      <div class="mb-lightbox-body">${image}
        <div class="mb-lightbox-meta">
          <strong>${esc(item.caption || item.name)}</strong>
          <div class="mb-tags">${tags}</div>
          ${source}
          <button class="btn ghost" data-action="close">Close (Esc)</button>
        </div>
      </div></div>`;
  }

  function render() {
    if (!state) return;
    const error = state.error ? `<div class="error"><span>${esc(state.error)}</span></div>` : "";
    const allTags = [...new Set(state.items.flatMap((i) => i.tags))].sort();
    const items = visibleItems();
    const focusSearch = document.activeElement?.id === "mb-search";
    const title = state.projectName ? `Moodboard · ${state.projectName}` : "Moodboard";
    const chips = allTags.length
      ? `<div class="mb-filter">${["", ...allTags]
          .map((t) => `<button class="mb-chip ${t === tag ? "active" : ""}" data-action="tag" data-tag="${esc(t)}">${t ? esc(t) : "All"}</button>`)
          .join("")}</div>`
      : "";
    const empty =
      !state.loading && !state.error && state.items.length === 0
        ? `<p class="muted mb-empty">No images on this moodboard yet. Add them on the website under Knowledge → Moodboard.</p>`
        : "";
    const tiles = items
      .map(
        (item) => `<button class="mb-tile" data-action="open" data-id="${esc(item.id)}" title="${esc(item.caption || item.name)}">
          ${thumb(item.id, item.caption || item.name)}
          ${item.caption ? `<span class="mb-caption">${esc(item.caption)}</span>` : ""}
        </button>`
      )
      .join("");
    app.innerHTML = `<div class="toolbar"><span class="brand">Guidon</span><strong>${esc(title)}</strong>
        <button class="btn" data-action="refresh">Refresh</button><button class="btn" data-action="browser">Open in Browser</button>
        ${state.loading ? `<span class="muted">Loading…</span>` : ""}<span class="spacer"></span>
        <input id="mb-search" placeholder="Search captions and tags" value="${esc(query)}"></div>${error}
      ${chips}${empty}<div class="mb-grid">${tiles}</div>${lightbox()}`;
    if (focusSearch) {
      const el = /** @type {HTMLInputElement} */ (document.getElementById("mb-search"));
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }

  document.addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const el = /** @type {HTMLElement|null} */ (target.closest("[data-action]"));
    if (!el) return;
    switch (el.dataset.action) {
      case "refresh":
        return post("refresh");
      case "browser":
        return post("openBrowser");
      case "tag":
        tag = el.dataset.tag ?? "";
        return render();
      case "open":
        openId = el.dataset.id ?? "";
        return render();
      case "close":
        // The backdrop itself or the Close button - not clicks inside the image/meta.
        if (target === el || el.tagName === "BUTTON") {
          openId = "";
          render();
        }
        return;
      case "source":
        return post("openSource", { url: el.dataset.url });
    }
  });

  document.addEventListener("input", (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.id === "mb-search") {
      query = el.value;
      render();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openId) {
      openId = "";
      render();
    }
  });

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "state") {
      if (!state || message.state.projectName !== state.projectName) {
        tag = "";
        openId = "";
      }
      state = message.state;
      for (const id of Object.keys(images)) if (!state.items.some((i) => i.id === id)) delete images[id];
      render();
    } else if (message.type === "image") {
      images[message.id] = message.src;
      // Patch just this tile rather than re-rendering the whole grid for every image.
      const tile = document.querySelector(`.mb-tile[data-id="${CSS.escape(message.id)}"]`);
      const placeholder = tile?.querySelector(".mb-placeholder");
      if (placeholder && !openId) {
        const item = state.items.find((i) => i.id === message.id);
        placeholder.outerHTML = thumb(message.id, item?.caption || item?.name || "");
      } else if (openId === message.id) {
        render();
      }
    }
  });

  post("ready");
})();
