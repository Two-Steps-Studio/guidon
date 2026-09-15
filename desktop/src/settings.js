// Local Settings window logic (server URL + config persistence, Task 2 of
// the desktop plan). This page is genuinely local, privileged content
// (served via tauri://) - see capabilities/settings.json for exactly what
// it's allowed to call.
//
// It talks to Rust only through `window.__TAURI__.core.invoke` (exposed
// because tauri.conf.json sets `app.withGlobalTauri: true`), not by
// importing `@tauri-apps/plugin-store` directly: that package's JS bindings
// have bare `@tauri-apps/api/*` imports that need a bundler to resolve, and
// this static frontend (served as-is, no build step - see
// tauri.conf.json's `build.frontendDist`) doesn't have one. The two Rust
// commands it calls (get_server_url/save_server_url, src-tauri/src/lib.rs)
// use the Store plugin themselves under the hood.

const DEFAULT_SERVER_URL = "https://useguidon.com";

const form = document.querySelector("#settings-form");
const input = document.querySelector("#server-url");
const status = document.querySelector("#status");
const saveButton = document.querySelector("#save-button");

function setStatus(message, isError) {
  status.textContent = message;
  status.classList.toggle("status-error", Boolean(isError));
}

function isPlausibleUrl(value) {
  if (!/^https?:\/\//i.test(value)) {
    return false;
  }
  try {
    return Boolean(new URL(value).host);
  } catch {
    return false;
  }
}

async function loadCurrentUrl() {
  try {
    const invoke = window.__TAURI__.core.invoke;
    input.value = await invoke("get_server_url");
  } catch (err) {
    console.error("failed to read the stored server URL", err);
    input.value = DEFAULT_SERVER_URL;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const value = input.value.trim();

  if (!isPlausibleUrl(value)) {
    setStatus("Enter a URL starting with http:// or https://", true);
    return;
  }

  saveButton.disabled = true;
  setStatus("Saving…", false);
  try {
    const invoke = window.__TAURI__.core.invoke;
    await invoke("save_server_url", { url: value });
    setStatus("Saved. The main window is reloading at the new URL.", false);
  } catch (err) {
    setStatus(
      typeof err === "string" ? err : "Failed to save the server URL.",
      true,
    );
  } finally {
    saveButton.disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  form.addEventListener("submit", handleSubmit);
  loadCurrentUrl();
});
