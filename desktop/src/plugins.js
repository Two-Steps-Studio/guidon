// Install Editor Plugins window (local, bundled content - see
// capabilities/plugins.json for the four commands it may call, all in
// src-tauri/src/plugins.rs). The window only ever passes a download id and
// a folder; the zip URL, checksum and install path come from the server's
// manifest, which Rust fetched itself.

const invoke = (...args) => window.__TAURI__.core.invoke(...args);

const KIND_LABELS = { tasks: "Task board", reports: "In-game reports" };

const $ = (selector) => document.querySelector(selector);
const steps = { pick: $("#step-pick"), folder: $("#step-folder"), done: $("#step-done") };

let selected = null; // { plugin, download }
let folder = null;

function showStep(name) {
  for (const [key, el] of Object.entries(steps)) el.hidden = key !== name;
}

function setStatus(el, message, kind) {
  el.textContent = message;
  el.classList.toggle("status-error", kind === "error");
  el.classList.toggle("status-warn", kind === "warn");
}

function errorText(err, fallback) {
  return typeof err === "string" ? err : fallback;
}

async function loadCatalog() {
  const list = $("#plugin-list");
  const status = $("#catalog-status");
  list.replaceChildren();
  $("#retry-button").hidden = true;
  setStatus(status, "Loading…");
  try {
    const catalog = await invoke("plugin_catalog");
    $("#server-line").textContent = `From ${catalog.server.replace(/\/$/, "")}`;
    setStatus(status, catalog.plugins.length ? "" : "This server has no plugins to install.");
    for (const plugin of catalog.plugins) list.append(renderPlugin(plugin));
  } catch (err) {
    $("#server-line").textContent = "Couldn't load the plugin list.";
    setStatus(status, errorText(err, "Couldn't load the plugin list."), "error");
    $("#retry-button").hidden = false;
  }
}

function renderPlugin(plugin) {
  const item = document.createElement("li");
  item.className = "plugin";

  const header = document.createElement("div");
  header.className = "plugin-header";
  const name = document.createElement("strong");
  name.textContent = plugin.name;
  header.append(name);
  if (plugin.requires) {
    const requires = document.createElement("span");
    requires.className = "hint";
    requires.textContent = plugin.requires;
    header.append(requires);
  }
  item.append(header);

  const actions = document.createElement("div");
  actions.className = "plugin-actions";
  for (const download of plugin.downloads) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = KIND_LABELS[download.kind] ?? download.kind;
    button.setAttribute("aria-label", `Install ${plugin.name}: ${button.textContent}`);
    button.addEventListener("click", () => chooseDownload(plugin, download));
    actions.append(button);
  }
  item.append(actions);
  return item;
}

function chooseDownload(plugin, download) {
  selected = { plugin, download };
  folder = null;
  $("#folder-heading").textContent = `2. Where should ${plugin.name} (${KIND_LABELS[download.kind] ?? download.kind}) go?`;
  $("#folder-hint").textContent = `Pick your ${download.folder}.`;
  $("#folder-path").textContent = "";
  setStatus($("#folder-status"), "");
  $("#install-button").disabled = true;
  $("#install-button").textContent = "Install";
  showStep("folder");
  $("#pick-folder-button").focus();
}

async function pickFolder() {
  const picked = await invoke("pick_plugin_folder").catch(() => null);
  if (!picked) return;
  folder = picked;
  $("#folder-path").textContent = picked;
  const status = $("#folder-status");
  try {
    const check = await invoke("check_plugin_folder", { downloadId: selected.download.id, folder });
    const where = `It will go to ${check.target}.`;
    if (!check.looks_right) {
      setStatus(status, `This doesn't look like the right folder - expected your ${selected.download.folder}. ${where} Install anyway only if you're sure.`, "warn");
    } else {
      setStatus(status, check.already_installed ? `Already installed - this updates it in place (your own files there are kept). ${where}` : where);
    }
    $("#install-button").textContent = check.already_installed ? "Update" : "Install";
    $("#install-button").disabled = false;
  } catch (err) {
    setStatus(status, errorText(err, "Can't use that folder."), "error");
    $("#install-button").disabled = true;
  }
}

async function install() {
  const button = $("#install-button");
  button.disabled = true;
  setStatus($("#folder-status"), "Downloading and installing…");
  try {
    const report = await invoke("install_plugin", { downloadId: selected.download.id, folder });
    $("#done-summary").textContent = `${report.updated ? "Updated" : "Installed"} ${selected.plugin.name} - ${report.files} files.`;
    $("#done-path").textContent = report.target;
    $("#done-next").textContent = report.next;
    showStep("done");
    $("#another-button").focus();
  } catch (err) {
    setStatus($("#folder-status"), errorText(err, "Install failed."), "error");
    button.disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  $("#retry-button").addEventListener("click", loadCatalog);
  $("#pick-folder-button").addEventListener("click", pickFolder);
  $("#install-button").addEventListener("click", install);
  $("#back-button").addEventListener("click", () => showStep("pick"));
  $("#another-button").addEventListener("click", () => showStep("pick"));
  loadCatalog();
});
