# Guidon Tasks for VS Code

Your Guidon project board inside VS Code, plus Git helpers that tie commits
and branches to tasks. It's the VS Code counterpart of the other Guidon editor
plugins and uses the same public API (`/api/v1`, see
[the API's README](../../src/app/api/v1/README.md)).

## Install

```bash
cd plugins/vscode
npm install
npm run build
npm run package        # -> guidon-tasks-1.0.0.vsix
```

Then, in VS Code: **Extensions → ⋯ → Install from VSIX…** and pick the file,
or run `code --install-extension guidon-tasks-1.0.0.vsix`. It requires
VS Code 1.85 or newer.

## Use

- **Guidon: Open Board** (Command Palette, or click **Guidon** in the status bar).
  - The board looks like the website: its colors, light or dark following
    your VS Code theme.
  - It shows the project's own columns: their labels, order and hidden columns.
  - Drag a card onto another column to change its status. **+** on a column
    creates a task in it (Enter to create, Esc to cancel).
  - Click a card to open it on the right: edit the title, status, priority,
    due date and Markdown description, add subtasks (the checkbox marks them
    done), comment, or delete.
- **Log In** opens the Guidon website in your browser. Click **Authorize**
  there and VS Code picks up the key.

### Git and GitHub

With the server's GitHub integration on (`GITHUB_APP_WEBHOOK_SECRET`, see
`docs/configuration.md`), a commit, PR or branch name that mentions
`guidon#1a2b3c4d` links to the task and moves it: a commit → In Progress,
a PR → Review, a merge into the default branch → Done. The extension makes
that reference easy to use:

- **Guidon: Insert Task Reference in Commit Message**: an icon in the Source
  Control view's title bar. Pick a task and its `guidon#…` is appended to the
  commit message (never twice).
- **Guidon: Start Task on a New Branch** (or **New branch** in the task
  details): creates and checks out `guidon-1a2b3c4d-short-title`, with an
  optional prefix from the `guidon.branchPrefix` setting such as `feature/`.
  It pre-fills the commit message with the reference and moves the task from
  Backlog/Todo to In Progress. Polish and other accented titles are
  transliterated (`Zażółć` → `zazolc`).
- **Copy** in the task details copies the reference.

## Settings and storage

| Setting | Default | |
|---|---|---|
| `guidon.baseUrl` | `https://useguidon.com` | Your Guidon instance, e.g. `http://localhost:2137` |
| `guidon.branchPrefix` | *(empty)* | Prefix for branches from "Start Task on a New Branch" |

The API key is kept in VS Code's **SecretStorage** (the OS keychain), never
in `settings.json` or the workspace. It shows up on the website as
**"VS Code Extension"** under **Profile → API Keys**, separate from the other
plugins' keys. **Guidon: Log Out** removes it locally. Revoke it on the website
if you lose a machine.

Login uses the same loopback flow as the other plugins: `127.0.0.1`, ports
51820-51829, `/auth/plugin-login?client=vscode`. That needs VS Code's extension
host on the same machine as your browser. In a **Remote-SSH, WSL, Dev
Container or Codespaces** window, the listener runs on the remote side and
the browser can't reach it, so log in from a local window first. (A future
version could use a `vscode://` URI handler instead, but the server only
accepts loopback redirects today.)

## How it's built

- `src/extension.ts` handles commands, the status bar, SecretStorage and the
  Git helpers (through the built-in Git extension's API).
- `src/store.ts` holds the board state and actions.
- `src/api.ts` is the `/api/v1` client (Node's built-in `fetch`).
- `src/login.ts` is the loopback login.
- `src/model.ts` holds the vocabulary, board ordering, `gitRef`/`branchName`/`withRef`.
- `media/board.js` + `media/board.css` are the webview. It only renders
  state and posts actions back. It never calls the network itself, and its
  Content-Security-Policy allows nothing but the extension's own script and
  style.

`store.ts`, `api.ts`, `login.ts` and `model.ts` don't import `vscode`.

## Verified

VS Code itself couldn't be downloaded where this was written, so the
extension hasn't been run inside a real VS Code window yet. What was done
instead:

- `tsc` against `@types/vscode` 1.85 compiles with no errors, and
  `vsce package` builds the `.vsix`.
- The **compiled extension's `activate()`** ran in Node against a stand-in
  `vscode` module, with the **real webview script in Chromium**, a **real
  local Guidon** (Next.js + PostgreSQL 16, every migration applied) and a
  **real Git repository**, in both dark and light themes. Checked:
  - real browser login: a scripted browser clicked Authorize, and the key
    landed in SecretStorage as "VS Code Extension";
  - the project's custom columns;
  - a mouse drag-and-drop between columns;
  - edit and save, and local rejection of an invalid date;
  - comments, subtasks, inline create and a status change;
  - the branch created and checked out with the commit message pre-filled
    and the task moved to In Progress;
  - Insert Task Reference (no duplicates);
  - delete with a modal confirmation, and log out;
  - no JavaScript errors in the webview.

The remaining risk is behavior of the real VS Code API that the stand-in
doesn't reproduce.
