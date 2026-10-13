/*!
 * Guidon bug report widget - https://useguidon.com
 *
 * Embed on any website:
 *
 *   <script src="https://useguidon.com/widget/report.js"
 *           data-project="<project id>"
 *           data-key="<report key - reports:write only>"
 *           async></script>
 *
 * Reports become Backlog tasks tagged `bug`/`feedback` + `web`, with the
 * page URL, browser and recent JavaScript errors attached as a table and
 * up to three screenshots as attachments. The key can only file reports
 * (POST /api/v1/projects/<id>/reports) - it can't read or change anything,
 * which is why it's fine for it to sit in the page source.
 *
 * Optional attributes:
 *   data-lang="pl|en|de|es"     interface language (default: the browser's)
 *   data-position="left"        launcher in the bottom-left corner
 *   data-color="#2563eb"        accent colour
 *   data-button="false"         no floating button - open it yourself with
 *                               window.GuidonReport.open()
 *   data-label="Report a bug"   launcher text
 *   data-reporter="ana@x.com"   prefill the contact field (e.g. the
 *                               signed-in user); also GuidonReport.setReporter()
 *
 * No dependencies, no cookies, nothing sent until the user presses Send.
 */
(function () {
  "use strict";
  if (window.GuidonReport && window.GuidonReport.__loaded) return;

  var script = document.currentScript;
  if (!script) return;
  var cfg = script.dataset;
  var project = (cfg.project || "").trim();
  var key = (cfg.key || "").trim();
  if (!project || !key) {
    console.warn("[Guidon] report widget: data-project and data-key are required.");
    return;
  }
  var endpoint = new URL("/api/v1/projects/" + encodeURIComponent(project) + "/reports", script.src).href;
  var accent = /^#[0-9a-f]{3,8}$/i.test(cfg.color || "") ? cfg.color : "#2563eb";
  var left = cfg.position === "left";

  var STRINGS = {
    en: {
      launcher: "Report a bug", title: "Report a problem", bug: "Bug", feedback: "Suggestion",
      what: "What happened?", whatPh: "What did you do, what did you expect, and what happened instead?",
      contact: "Your email (optional)", contactPh: "so we can ask follow-up questions",
      shots: "Screenshots (optional, up to 3)", details: "Include technical details (page address, browser, recent errors)",
      send: "Send", sending: "Sending...", cancel: "Cancel", close: "Close",
      thanks: "Thank you! Your report was sent.", tooShort: "Please describe the problem.",
      tooMany: "At most 3 screenshots.", tooBig: "Each screenshot must be under 10 MB.", failed: "Couldn't send the report: ",
    },
    pl: {
      launcher: "Zgłoś błąd", title: "Zgłoś problem", bug: "Błąd", feedback: "Sugestia",
      what: "Co się stało?", whatPh: "Co zrobiłeś, czego się spodziewałeś i co się stało zamiast tego?",
      contact: "Twój e-mail (opcjonalnie)", contactPh: "żebyśmy mogli dopytać",
      shots: "Zrzuty ekranu (opcjonalnie, maks. 3)", details: "Dołącz dane techniczne (adres strony, przeglądarka, ostatnie błędy)",
      send: "Wyślij", sending: "Wysyłanie...", cancel: "Anuluj", close: "Zamknij",
      thanks: "Dziękujemy! Zgłoszenie zostało wysłane.", tooShort: "Opisz problem.",
      tooMany: "Maksymalnie 3 zrzuty ekranu.", tooBig: "Każdy zrzut musi mieć mniej niż 10 MB.", failed: "Nie udało się wysłać zgłoszenia: ",
    },
    de: {
      launcher: "Fehler melden", title: "Problem melden", bug: "Fehler", feedback: "Vorschlag",
      what: "Was ist passiert?", whatPh: "Was hast du getan, was hast du erwartet und was ist stattdessen passiert?",
      contact: "Deine E-Mail (optional)", contactPh: "für Rückfragen",
      shots: "Screenshots (optional, bis zu 3)", details: "Technische Details anhängen (Seitenadresse, Browser, letzte Fehler)",
      send: "Senden", sending: "Wird gesendet...", cancel: "Abbrechen", close: "Schließen",
      thanks: "Danke! Deine Meldung wurde gesendet.", tooShort: "Bitte beschreibe das Problem.",
      tooMany: "Höchstens 3 Screenshots.", tooBig: "Jeder Screenshot muss kleiner als 10 MB sein.", failed: "Meldung konnte nicht gesendet werden: ",
    },
    es: {
      launcher: "Informar de un error", title: "Informar de un problema", bug: "Error", feedback: "Sugerencia",
      what: "¿Qué ha pasado?", whatPh: "¿Qué hiciste, qué esperabas y qué ocurrió en su lugar?",
      contact: "Tu correo (opcional)", contactPh: "para poder hacerte preguntas",
      shots: "Capturas (opcional, hasta 3)", details: "Incluir datos técnicos (dirección de la página, navegador, errores recientes)",
      send: "Enviar", sending: "Enviando...", cancel: "Cancelar", close: "Cerrar",
      thanks: "¡Gracias! Tu informe se ha enviado.", tooShort: "Describe el problema.",
      tooMany: "Como máximo 3 capturas.", tooBig: "Cada captura debe pesar menos de 10 MB.", failed: "No se pudo enviar el informe: ",
    },
  };
  var lang = (cfg.lang || navigator.language || "en").slice(0, 2).toLowerCase();
  var t = STRINGS[lang] || STRINGS.en;
  if (cfg.label) t.launcher = cfg.label;

  // Recent uncaught errors, from the moment the widget loaded - often the
  // most useful part of a web bug report. Only messages and locations, and
  // only sent if the user leaves "technical details" ticked.
  var recentErrors = [];
  function remember(message) {
    recentErrors.push(String(message).slice(0, 300));
    if (recentErrors.length > 10) recentErrors.shift();
  }
  window.addEventListener("error", function (event) {
    if (event.message) remember(event.message + (event.filename ? " @ " + event.filename + ":" + event.lineno : ""));
  });
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    remember("Unhandled rejection: " + (reason && reason.message ? reason.message : reason));
  });

  var reporter = cfg.reporter || "";
  var host, root, dialog, previousFocus;

  var CSS =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
    ".launch{position:fixed;bottom:20px;" + (left ? "left" : "right") + ":20px;z-index:2147483646;display:flex;align-items:center;gap:8px;" +
    "border:0;border-radius:999px;padding:10px 16px;background:" + accent + ";color:#fff;font-size:14px;font-weight:600;cursor:pointer;" +
    "box-shadow:0 4px 14px rgba(0,0,0,.2);transition:transform .15s ease}" +
    ".launch:hover{transform:translateY(-1px)}.launch:active{transform:scale(.97)}" +
    ".launch svg{width:16px;height:16px}" +
    ".backdrop{position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.45);display:flex;align-items:flex-end;justify-content:center;padding:16px}" +
    "@media(min-width:640px){.backdrop{align-items:center}}" +
    ".panel{width:100%;max-width:440px;max-height:calc(100dvh - 32px);overflow:auto;background:#fff;color:#0f172a;border-radius:14px;padding:20px;" +
    "box-shadow:0 20px 50px rgba(0,0,0,.3)}" +
    "@media(prefers-color-scheme:dark){.panel{background:#0f172a;color:#e2e8f0}textarea,input[type=email]{background:#1e293b;color:#e2e8f0;border-color:#334155}.seg label{border-color:#334155}.ghost{color:#e2e8f0;border-color:#334155}}" +
    "h2{margin:0 0 14px;font-size:18px}" +
    "label.f{display:block;font-size:13px;font-weight:600;margin:12px 0 6px}" +
    "textarea,input[type=email]{width:100%;font-size:16px;padding:9px 11px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a}" +
    "textarea{min-height:110px;resize:vertical}" +
    "textarea:focus,input:focus{outline:2px solid " + accent + ";outline-offset:1px}" +
    ".seg{display:flex;gap:8px}.seg label{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-size:14px;cursor:pointer}" +
    ".seg input{accent-color:" + accent + "}" +
    ".chk{display:flex;gap:8px;align-items:flex-start;font-size:13px;margin-top:12px;opacity:.85}.chk input{margin-top:2px;accent-color:" + accent + "}" +
    "input[type=file]{font-size:13px;max-width:100%}" +
    ".row{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}" +
    "button.b{border-radius:8px;padding:9px 16px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid transparent}" +
    ".primary{background:" + accent + ";color:#fff}.primary:disabled{opacity:.6;cursor:default}" +
    ".ghost{background:transparent;color:#0f172a;border-color:#cbd5e1}" +
    ".msg{margin-top:12px;font-size:13px;color:#dc2626}.ok{font-size:15px;margin:8px 0 4px}";

  var BUG_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/>' +
    '<path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    for (var name in attrs || {}) {
      if (name === "text") node.textContent = attrs[name];
      else node.setAttribute(name, attrs[name]);
    }
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }

  function mount() {
    host = el("div", { "data-guidon-report": "" });
    root = host.attachShadow({ mode: "open" });
    root.appendChild(el("style", { text: CSS }));
    if (cfg.button !== "false") {
      var launch = el("button", { class: "launch", type: "button", "aria-haspopup": "dialog" });
      launch.innerHTML = BUG_ICON;
      launch.appendChild(el("span", { text: t.launcher }));
      launch.addEventListener("click", open);
      root.appendChild(launch);
    }
    document.body.appendChild(host);
  }

  function technicalDetails() {
    var details = {
      page: location.href.slice(0, 500),
      browser: navigator.userAgent.slice(0, 500),
      language: navigator.language || "",
      viewport: window.innerWidth + "x" + window.innerHeight,
      screen: screen.width + "x" + screen.height + " @" + (window.devicePixelRatio || 1) + "x",
      time: new Date().toISOString(),
    };
    if (document.referrer) details.referrer = document.referrer.slice(0, 500);
    recentErrors.forEach(function (message, i) { details["error " + (i + 1)] = message; });
    return details;
  }

  function close() {
    if (!dialog) return;
    dialog.remove();
    dialog = null;
    document.removeEventListener("keydown", onKey, true);
    if (previousFocus && previousFocus.focus) previousFocus.focus();
  }

  function onKey(event) {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
  }

  function open() {
    if (!host) mount();
    if (dialog) return;
    previousFocus = document.activeElement;

    var description = el("textarea", { id: "g-what", placeholder: t.whatPh, maxlength: "10000", required: "" });
    var contact = el("input", { id: "g-contact", type: "email", placeholder: t.contactPh, maxlength: "200", autocomplete: "email" });
    contact.value = reporter;
    var files = el("input", { id: "g-shots", type: "file", accept: "image/png,image/jpeg,image/webp", multiple: "" });
    var details = el("input", { type: "checkbox", checked: "" });
    var message = el("p", { class: "msg", role: "alert" });
    var send = el("button", { class: "b primary", type: "submit", text: t.send });
    var cancel = el("button", { class: "b ghost", type: "button", text: t.cancel });
    cancel.addEventListener("click", close);

    var bug = el("input", { type: "radio", name: "g-cat", value: "bug", checked: "" });
    var feedback = el("input", { type: "radio", name: "g-cat", value: "feedback" });

    var form = el("form", { novalidate: "" }, [
      el("h2", { id: "g-title", text: t.title }),
      el("div", { class: "seg", role: "radiogroup" }, [
        el("label", {}, [bug, el("span", { text: t.bug })]),
        el("label", {}, [feedback, el("span", { text: t.feedback })]),
      ]),
      el("label", { class: "f", for: "g-what", text: t.what }),
      description,
      el("label", { class: "f", for: "g-contact", text: t.contact }),
      contact,
      el("label", { class: "f", for: "g-shots", text: t.shots }),
      files,
      el("label", { class: "chk" }, [details, el("span", { text: t.details })]),
      message,
      el("div", { class: "row" }, [cancel, send]),
    ]);

    var panel = el("div", { class: "panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "g-title" }, [form]);
    dialog = el("div", { class: "backdrop" }, [panel]);
    dialog.addEventListener("mousedown", function (event) { if (event.target === dialog) close(); });
    document.addEventListener("keydown", onKey, true);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      message.textContent = "";
      var text = description.value.trim();
      if (text.length < 3) { message.textContent = t.tooShort; description.focus(); return; }
      var chosen = Array.prototype.slice.call(files.files || []);
      if (chosen.length > 3) { message.textContent = t.tooMany; return; }
      if (chosen.some(function (file) { return file.size > 10 * 1024 * 1024; })) { message.textContent = t.tooBig; return; }

      var body = new FormData();
      var firstLine = text.split("\n")[0];
      body.append("title", firstLine.length > 80 ? firstLine.slice(0, 79) + "…" : firstLine);
      body.append("description", text);
      body.append("category", feedback.checked ? "feedback" : "bug");
      body.append("source", "web");
      if (contact.value.trim()) body.append("reporter", contact.value.trim());
      if (details.checked) body.append("metadata", JSON.stringify(technicalDetails()));
      chosen.forEach(function (file) { body.append("file", file, file.name); });

      send.disabled = true;
      send.textContent = t.sending;
      fetch(endpoint, { method: "POST", headers: { Authorization: "Bearer " + key }, body: body })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (data) {
            if (!response.ok) throw new Error(data.error || "HTTP " + response.status);
          });
        })
        .then(function () {
          reporter = contact.value.trim();
          panel.innerHTML = "";
          var done = el("button", { class: "b primary", type: "button", text: t.close });
          done.addEventListener("click", close);
          panel.appendChild(el("p", { class: "ok", role: "status", text: t.thanks }));
          panel.appendChild(el("div", { class: "row" }, [done]));
          done.focus();
        })
        .catch(function (error) {
          message.textContent = t.failed + (error && error.message ? error.message : error);
          send.disabled = false;
          send.textContent = t.send;
        });
    });

    root.appendChild(dialog);
    description.focus();
  }

  window.GuidonReport = {
    __loaded: true,
    open: open,
    close: close,
    setReporter: function (value) { reporter = String(value || ""); },
  };

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
