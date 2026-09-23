// @ts-check
// The board webview. The extension owns all state and API calls; this file
// only renders `state` messages and posts the user's actions back.
(function () {
  const vscode = acquireVsCodeApi();
  /** @type {any} */ let state = null;
  let addingIn = "";
  /** Details edit buffers - survive re-renders, reset when another task opens. */
  let edit = { id: "", title: "", description: "", priority: "medium", due: "", subtask: "", comment: "" };

  const STATUS_COLOR = { backlog: "--text-muted", todo: "--info", in_progress: "--warning", ai_working: "--info", review: "--primary", done: "--success" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const post = (type, data = {}) => vscode.postMessage({ type, ...data });
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  const ref = (id) => "guidon#" + id.slice(0, 8).toLowerCase();

  function preview(description) {
    for (const raw of String(description ?? "").split("\n")) {
      const line = raw.trim().replace(/^[#>*\-\s]+/, "").replace(/\*\*|`/g, "");
      if (line) return line;
    }
    return "";
  }

  function columnTasks(status) {
    return state.tasks
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.status === status && !t.parent_task_id)
      .sort((a, b) => (a.t.sort_order ?? 0) - (b.t.sort_order ?? 0) || a.i - b.i)
      .map(({ t }) => t);
  }

  const subtasks = (id) => state.tasks.filter((t) => t.parent_task_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));

  function card(task) {
    const subs = subtasks(task.id);
    const done = subs.filter((s) => s.status === "done").length;
    const tags = task.tags ?? [];
    return `<div class="card ${task.id === state.selectedTaskId ? "selected" : ""} ${task.status === "done" ? "done" : ""}" draggable="true" data-task="${esc(task.id)}">
      <div class="title"><span class="dot" style="background:var(--p-${esc(task.priority)})"></span><span>${esc(task.title)}</span></div>
      ${preview(task.description) ? `<div class="preview">${esc(preview(task.description))}</div>` : ""}
      ${tags.length ? `<div class="tags">${tags.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}${tags.length > 3 ? `<span class="small muted">+${tags.length - 3}</span>` : ""}</div>` : ""}
      <div class="footer"><span>${esc(cap(task.priority))}</span>${task.due_date ? `<span>${esc(task.due_date.slice(0, 10))}</span>` : ""}${subs.length ? `<span>✓ ${done}/${subs.length}</span>` : ""}</div>
    </div>`;
  }

  function column(col) {
    const tasks = columnTasks(col.status);
    const adding = addingIn === col.status;
    return `<section class="column" data-status="${esc(col.status)}">
      <header><span class="dot" style="background:var(${STATUS_COLOR[col.status] ?? "--text-muted"})"></span><h3>${esc(col.label)}</h3><span class="pill">${tasks.length}</span>
        <button class="btn ghost" data-action="add" data-status="${esc(col.status)}" title="Create a task in this column">+</button></header>
      <div class="cards">${tasks.map(card).join("")}
        ${adding ? `<input id="new-task" data-status="${esc(col.status)}" placeholder="Task title, Enter to create">` : tasks.length ? "" : `<div class="empty">Drop tasks here</div>`}
      </div></section>`;
  }

  function details() {
    const task = state.tasks.find((t) => t.id === state.selectedTaskId);
    if (!task) return `<aside class="details"><span class="muted">Click a card to open it here. Drag cards between columns to change their status.</span></aside>`;
    if (edit.id !== task.id) {
      edit = { id: task.id, title: task.title, description: task.description ?? "", priority: task.priority || "medium", due: (task.due_date ?? "").slice(0, 10), subtask: "", comment: "" };
    }
    const options = state.columns.map((c) => c.status);
    if (!options.includes(task.status)) options.push(task.status);
    const label = (s) => state.columns.find((c) => c.status === s)?.label ?? s;
    const comments = state.comments[task.id];
    return `<aside class="details">
      ${task.parent_task_id ? `<div class="sub"><a data-action="open" data-task="${esc(task.parent_task_id)}">← Back to parent task</a></div>` : ""}
      <div class="ref" title="Mention this in a commit, PR or branch name - the GitHub integration links and moves the task">Git ref <code>${esc(ref(task.id))}</code>
        <button class="btn ghost" data-action="copy-ref" title="Copy the reference">Copy</button>
        <button class="btn ghost" data-action="branch" title="Create and check out a branch for this task">New branch</button></div>
      <label>Title</label><input id="f-title" value="${esc(edit.title)}">
      <div class="row">
        <div><label>Status</label><select id="f-status">${options.map((s) => `<option value="${esc(s)}" ${s === task.status ? "selected" : ""}>${esc(label(s))}</option>`).join("")}</select></div>
        <div><label>Priority</label><select id="f-priority">${["low", "medium", "high", "critical"].map((p) => `<option value="${p}" ${p === edit.priority ? "selected" : ""}>${cap(p)}</option>`).join("")}</select></div>
      </div>
      <label>Due date</label><input id="f-due" placeholder="YYYY-MM-DD" value="${esc(edit.due)}">
      <label>Description (Markdown)</label><textarea id="f-description" rows="7">${esc(edit.description)}</textarea>
      <div class="actions"><button class="btn primary" data-action="save">Save</button><button class="btn destructive" data-action="delete">Delete</button></div>
      ${task.parent_task_id ? "" : `<label>Subtasks</label>
        ${subtasks(task.id).map((s) => `<div class="sub"><input type="checkbox" data-action="toggle" data-task="${esc(s.id)}" ${s.status === "done" ? "checked" : ""}><a data-action="open" data-task="${esc(s.id)}">${esc(s.title)}</a></div>`).join("")}
        <input id="f-subtask" placeholder="New subtask, Enter to add" value="${esc(edit.subtask)}">`}
      <label>Comments</label>
      ${comments === undefined ? `<span class="muted small">Loading…</span>` : comments.length === 0 ? `<span class="muted small">No comments yet.</span>` :
        comments.map((c) => `<div class="comment"><span class="muted small">${esc(c.actor_label || "Someone")} - ${esc((c.created_at || "").slice(0, 16).replace("T", " "))}</span><p>${esc(c.content)}</p></div>`).join("")}
      <textarea id="f-comment" rows="3" placeholder="Write a comment…">${esc(edit.comment)}</textarea>
      <div class="actions" style="justify-content:flex-end"><button class="btn primary" data-action="comment">Post</button></div>
    </aside>`;
  }

  function render() {
    const app = document.getElementById("app");
    if (!app || !state) return;
    // Keep focus and caret across re-renders (state arrives while typing, e.g. comments loading).
    const focused = /** @type {HTMLInputElement|null} */ (document.activeElement);
    const focusId = focused?.id;
    const caret = focusId && "selectionStart" in focused ? [focused.selectionStart, focused.selectionEnd] : null;

    const error = state.error ? `<div class="error"><span>${esc(state.error)}</span><button class="btn ghost" data-action="dismiss">✕</button></div>` : "";
    if (!state.loggedIn) {
      app.innerHTML = `<div class="toolbar"><span class="brand">Guidon</span></div>${error}
        <div class="login"><div class="card"><h2>Log in to Guidon</h2>
          <span class="muted">Logging in opens the Guidon website in your browser. Approve the extension there and this board picks up the result automatically.</span>
          <input id="f-baseurl" value="${esc(state.baseUrl)}" placeholder="https://useguidon.com">
          <button class="btn primary" data-action="login" ${state.loggingIn ? "disabled" : ""}>${state.loggingIn ? "Waiting for the browser…" : "Log In"}</button>
        </div></div>`;
    } else {
      app.innerHTML = `<div class="toolbar"><span class="brand">Guidon</span>
          <select id="f-project">${state.projects.map((p) => `<option value="${esc(p.id)}" ${p.id === state.projectId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
          <button class="btn" data-action="refresh">Refresh</button><button class="btn" data-action="browser">Open in Browser</button>
          ${state.busy ? `<span class="muted">Loading…</span>` : ""}<span class="spacer"></span>
          <span class="muted">Logged in as ${esc(state.email || "?")}</span><button class="btn" data-action="logout">Log Out</button></div>${error}
        <div class="layout"><div class="board">${state.projectId ? state.columns.map(column).join("") : `<span class="muted">No projects loaded yet.</span>`}</div>${details()}</div>`;
    }

    if (focusId) {
      const el = /** @type {HTMLInputElement|null} */ (document.getElementById(focusId));
      if (el) {
        el.focus();
        if (caret && "setSelectionRange" in el) el.setSelectionRange(caret[0], caret[1]);
      }
    }
    document.getElementById("new-task")?.focus();
  }

  // --- events (delegated, so they survive re-renders) ---------------------------
  document.addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const actionEl = /** @type {HTMLElement|null} */ (target.closest("[data-action]"));
    const cardEl = /** @type {HTMLElement|null} */ (target.closest(".card"));
    if (!actionEl && cardEl) return post("select", { id: cardEl.dataset.task });
    if (!actionEl) return;
    const id = state?.selectedTaskId;
    switch (actionEl.dataset.action) {
      case "login": return post("login", { baseUrl: /** @type {HTMLInputElement} */ (document.getElementById("f-baseurl")).value });
      case "logout": return post("logout");
      case "refresh": return post("refresh");
      case "browser": return post("openBrowser");
      case "dismiss": return post("dismissError");
      case "add": addingIn = addingIn === actionEl.dataset.status ? "" : actionEl.dataset.status ?? ""; return render();
      case "open": return post("select", { id: actionEl.dataset.task });
      case "copy-ref": return post("copyRef", { id });
      case "branch": return post("startBranch", { id });
      case "save": return post("save", { id, fields: { title: edit.title, description: edit.description, priority: edit.priority, due_date: edit.due } });
      case "delete": return post("delete", { id });
      case "comment": post("comment", { id, content: edit.comment }); edit.comment = ""; return;
    }
  });

  document.addEventListener("change", (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.id === "f-project") return post("selectProject", { id: el.value });
    if (el.id === "f-status") return post("move", { id: state.selectedTaskId, status: el.value });
    if (el.id === "f-priority") edit.priority = el.value;
    if (el.dataset.action === "toggle") post("move", { id: el.dataset.task, status: el.checked ? "done" : "todo" });
  });

  document.addEventListener("input", (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const key = { "f-title": "title", "f-description": "description", "f-due": "due", "f-subtask": "subtask", "f-comment": "comment" }[el.id];
    if (key) edit[key] = el.value;
  });

  document.addEventListener("keydown", (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.id === "new-task") {
      if (e.key === "Enter" && el.value.trim()) { post("create", { title: el.value.trim(), status: el.dataset.status }); addingIn = ""; }
      if (e.key === "Escape") { addingIn = ""; render(); }
    }
    if (el.id === "f-subtask" && e.key === "Enter" && el.value.trim()) {
      post("create", { title: el.value.trim(), parentId: state.selectedTaskId });
      edit.subtask = "";
    }
  });

  // Drag-and-drop between columns.
  document.addEventListener("dragstart", (e) => {
    const cardEl = /** @type {HTMLElement} */ (e.target).closest?.(".card");
    if (cardEl && e.dataTransfer) { e.dataTransfer.setData("application/x-guidon-task", cardEl.dataset.task ?? ""); e.dataTransfer.effectAllowed = "move"; }
  });
  document.addEventListener("dragover", (e) => {
    const col = /** @type {HTMLElement} */ (e.target).closest?.(".column");
    if (!col || !e.dataTransfer?.types.includes("application/x-guidon-task")) return;
    e.preventDefault();
    document.querySelectorAll(".column.drop").forEach((c) => c !== col && c.classList.remove("drop"));
    col.classList.add("drop");
  });
  document.addEventListener("dragleave", (e) => {
    const col = /** @type {HTMLElement} */ (e.target).closest?.(".column");
    if (col && !col.contains(/** @type {Node} */ (e.relatedTarget))) col.classList.remove("drop");
  });
  document.addEventListener("drop", (e) => {
    const col = /** @type {HTMLElement} */ (e.target).closest?.(".column");
    document.querySelectorAll(".column.drop").forEach((c) => c.classList.remove("drop"));
    const id = e.dataTransfer?.getData("application/x-guidon-task");
    if (!col || !id) return;
    e.preventDefault();
    post("move", { id, status: col.dataset.status });
  });

  window.addEventListener("message", (e) => {
    if (e.data?.type === "state") { state = e.data.state; render(); }
  });
  post("ready");
})();
