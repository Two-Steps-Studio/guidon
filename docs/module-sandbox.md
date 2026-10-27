# Module code (engine 1.3)

No migration. Engine 1.3 adds two things to the manifest:

- `script: { source }` - the module's own JavaScript (100,000 characters at most);
- a `custom` view, which that script draws.

Both need the `code:run` permission and `engine.minVersion` 1.3.0 or later. A
custom view without a script is invalid. The AI builder and the visual inspector
never produce either - code is always written by a person.

## Writing it

**Configuration → Code** (`/projects/<project>/modules/<module>/code`, project
owners/admins) opens a Monaco editor with the SDK's types built in
(`src/lib/work/module-sdk.ts`), a preview that runs against this project's
entries without saving, and the script's `console.log` output.

The first save needs a checkbox: it adds `code:run` and a custom view, so
everyone can see that the module now runs code. A module installed from the
Marketplace is read-only here: its code is part of a reviewed, signed version,
so the way to change it is to publish your own version.

```js
guidon.module({
  render(ctx) {             // ctx: { records, entities, form, canWrite }
    const notes = ctx.records.filter((record) => record.entity === "note");
    return { type: "stack", children: [
      { type: "heading", text: `${notes.length} notes` },
      ...(ctx.canWrite ? [{ type: "input", name: "note", label: "New note" }, { type: "button", label: "Add", action: "add" }] : []),
    ] };
  },
  onAction(action, payload, ctx) {   // returns a change or nothing
    if (action === "add") return { upsert: [{ entity: "note", values: { text: ctx.form.note } }] };
  },
});
```

The script returns a UI tree, not HTML. The tree can use these nodes:

- `stack`, `row`, `list`, `heading`, `badge`, `text`;
- `button`, `input`, `checkbox`;
- `table`, `progress`.

Guidon draws each node with its own components. A change has the form
`{ upsert?: [{ id?, entity, values }], remove?: [id] }`.

## Where it runs

```
Guidon page ──postMessage──▶ <iframe sandbox="allow-scripts" srcdoc> ──postMessage──▶ Web Worker (module script)
   draws the tree             relays only, CSP below                        prelude removes network/storage
   saves changes via the
   module's Server Action
```

- **The iframe** has no `allow-same-origin`, so its origin is opaque. It has
  no Guidon cookies, `localStorage`, session or same-origin requests, and
  cannot reach `window.parent`'s DOM. Its CSP is:

  ```
  default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; …
  ```

  The iframe relays messages only to and from its parent.
- **The worker** has no DOM. The prelude (`WORKER_PRELUDE`) deletes these
  entry points:

  - network: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `WebTransport`;
  - code and workers: `importScripts`, `Worker`, `SharedWorker`;
  - storage and messaging: `indexedDB`, `caches`, `BroadcastChannel`;
  - `navigator`.

  The CSP already blocks the same things; deleting them is a second wall. The
  prelude then wraps the script in a function where `self`, `globalThis`,
  `postMessage` and `onmessage` are `undefined`. `eval`/`Function` fail
  because the CSP has no `'unsafe-eval'`.
- **The host** (`ModuleSandboxView`) sends the worker only three things: the
  module's own entries and entity schemas, the current form values, and
  `canWrite`. It never sends the user, project or session. It accepts messages
  only from its own iframe's window.
- Every answer is validated before use. A tree goes through `parseUiTree`:
  schema, at most 1,000 nodes, depth 12, 2,000 characters per text. A change
  goes through `sandboxChangeSchema`: scalar values, at most 100 upserts or
  removals. A valid change is then saved by the same Server Action as the
  module's forms (`saveModuleRecords`), which applies these checks:

  - role (owner/admin);
  - enabled module;
  - revision;
  - entity and field validation;
  - RLS.

  A viewer's script gets `canWrite: false`, and a change it returns anyway is
  not saved.
- **Limits**: a request that isn't answered within 2 s replaces the iframe and
  its worker. An endless loop stalls only its own thread. The page stays usable,
  shows why the module was restarted, and offers **Restart**. At most 200 log
  lines are kept per run.

## Threat model

| Threat | Stopped by |
|---|---|
| Steal the session, call Guidon's API as the viewer | Opaque origin (no cookies/storage), `connect-src 'none'`, network APIs removed |
| Send project data out (exfiltration) | No network from frame or worker; no images, frames or forms in the frame; the host draws only text nodes, never URLs, HTML or styles |
| Read other projects or Guidon data | The worker only gets this module's entries; nothing else is sent |
| XSS in the host page | The tree is data drawn by React components; unknown node types and props are rejected |
| Write outside its module or as a viewer | Changes go through `saveModuleRecords` (role, revision, schema, RLS); `canWrite` only hides buttons |
| Freeze the tab (endless loop, huge output) | Worker runs off the main thread; 2 s watchdog replaces it; node, text and log limits |
| Phishing UI ("enter your password") | No free-form markup or links; inputs only feed the script, which can't send them anywhere |
| Malicious code in a Marketplace module | Review shows a `script` warning with its size, and the reviewer reads the source in the manifest; versions are immutable and signed; installation shows `code:run` for consent; reports and withdrawal |

Known limits:

- A script can show misleading text inside its own tab.
- A script can use CPU up to the watchdog limit.
- A reviewer reads the code by hand; there is no static analysis yet.
- Scripts run only in the browser. Nothing runs on the server, and automations
  (engine 1.2) stay declarative.

## Tests

- `test:modules` (`tests/module-sandbox.test.mjs`) runs the real prelude in
  `node:vm`. It checks that the network and global names are gone, that the
  template renders, and how actions, errors and logs behave. It also covers
  tree/change limits, the manifest rules (`code:run`, engine, custom view
  needs a script) and the review warning.
- E2E (`tests/e2e/module-sandbox.mjs`, every browser) saves code from the
  editor, then checks that:

  - the tab draws the code;
  - `fetch`, XHR, WebSocket, `eval` and `self` are unavailable;
  - a button saves an entry, and the database contains it;
  - an endless loop is stopped within the limit and **Restart** works;
  - a viewer gets no write buttons and no editor;
  - the frame and worker make no requests.
